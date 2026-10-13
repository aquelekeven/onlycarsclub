-- Preferences are service-only. Possession of the random token authorizes opt-out only.
create table public.only_email_preferences (
  email text primary key check (email = lower(btrim(email)) and email <> ''),
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.only_email_preferences enable row level security;
revoke all on public.only_email_preferences from public, anon, authenticated;
grant select, insert, update on public.only_email_preferences to service_role;

alter table public.transactional_email_outbox drop constraint transactional_email_outbox_status_check;
alter table public.transactional_email_outbox add constraint transactional_email_outbox_status_check
  check (status in ('pending','sending','sent','failed','suppressed'));

create function public.only_email_preference(p_email text)
returns table(unsubscribe_token uuid, unsubscribed_at timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.only_email_preferences(email) values (lower(btrim(p_email)))
  on conflict (email) do nothing;
  return query select p.unsubscribe_token, p.unsubscribed_at
    from public.only_email_preferences p where p.email = lower(btrim(p_email));
end;
$$;
revoke all on function public.only_email_preference(text) from public, anon, authenticated;
grant execute on function public.only_email_preference(text) to service_role;

create function public.only_email_unsubscribe(p_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare recipient text;
begin
  update public.only_email_preferences
    set unsubscribed_at = coalesce(unsubscribed_at, now())
    where unsubscribe_token = p_token returning email into recipient;
  if recipient is null then return false; end if;
  update public.transactional_email_outbox set status = 'suppressed',
    error_message = 'Destinatário descadastrado de e-mails opcionais', updated_at = now()
    where lower(btrim(recipient_email)) = recipient and status in ('pending','failed')
    and template in ('event_countdown','checkout_recovery','ticket_photo_reminder');
  return true;
end;
$$;
revoke all on function public.only_email_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.only_email_unsubscribe(uuid) to service_role;

-- Apply the preference both when enqueueing and when claiming an existing message.
create function public.only_suppress_optional_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('pending','failed','sending')
    and new.template in ('event_countdown','checkout_recovery','ticket_photo_reminder')
    and exists (select 1 from public.only_email_preferences p
      where p.email = lower(btrim(new.recipient_email)) and p.unsubscribed_at is not null)
  then
    new.status := 'suppressed';
    new.error_message := 'Destinatário descadastrado de e-mails opcionais';
  end if;
  return new;
end;
$$;
revoke all on function public.only_suppress_optional_email() from public, anon, authenticated;
create trigger only_suppress_optional_email before insert or update on public.transactional_email_outbox
  for each row execute function public.only_suppress_optional_email();
