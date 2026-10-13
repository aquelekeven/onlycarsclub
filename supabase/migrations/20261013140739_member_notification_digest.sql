alter policy notifications_own_select on public.site_notifications using (recipient_id=(select auth.uid()));
alter policy notifications_own_read on public.site_notifications using (recipient_id=(select auth.uid())) with check (recipient_id=(select auth.uid()));

create or replace function only_notifications_internal.recipients() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name),'[]'::jsonb) from public.profiles);
end $$;

create or replace function only_notifications_internal.send(p_recipient uuid,p_title text,p_body text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_key is null or length(btrim(p_title)) not between 1 and 100 or length(btrim(p_body)) not between 1 and 2000 or p_title is null or p_body is null then raise exception 'Preencha título e mensagem.'; end if;
 perform 1 from public.profiles where id=p_recipient for share;
 if not found then raise exception 'Destinatário não encontrado.'; end if;
 insert into public.site_notifications(recipient_id,sender_id,title,body,request_key) values(p_recipient,auth.uid(),btrim(p_title),btrim(p_body),p_key)
 on conflict(sender_id,request_key) do nothing returning id into result;
 if result is null then select id into result from public.site_notifications where sender_id=auth.uid() and request_key=p_key; end if;
 return result;
end $$;

create or replace function only_notifications_internal.audience(p_segment text,p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_segment not in ('all','expo','carona','combo','courtesy','no_purchase') or p_segment is null then raise exception 'Filtro inválido.'; end if;
 if p_segment<>'all' and p_event is null then raise exception 'Selecione um evento para este filtro.'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name),'[]'::jsonb) from public.profiles p where (p_segment='all' or
 (p_segment='no_purchase' and not exists(select 1 from public.tickets t join public.ticket_orders o on o.id=t.order_id where t.owner_user_id=p.id and t.event_id=p_event and o.status='paid' and t.status in ('active','checked_in'))) or
 exists(select 1 from public.tickets t left join public.ticket_orders o on o.id=t.order_id where t.owner_user_id=p.id and t.event_id=p_event and t.status in ('active','checked_in') and ((p_segment='courtesy' and t.is_complimentary) or (p_segment in ('expo','carona','combo') and t.ticket_kind=p_segment and o.status='paid' and not t.is_complimentary)))));
end $$;

create or replace function only_notifications_internal.send_group(p_recipients uuid[],p_title text,p_body text,p_key uuid,p_icon text,p_url text,p_label text) returns integer language plpgsql security definer set search_path='' as $$
declare recipient uuid; result uuid; total integer:=0; url text:=nullif(btrim(p_url),''); label text:=nullif(btrim(p_label),'');
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_key is null or coalesce(cardinality(p_recipients),0) not between 1 and 10000 then raise exception 'Selecione de 1 a 10000 destinatários.'; end if;
 if url is not null and (length(url)>2048 or url ~ '[[:space:]]' or position(chr(92) in url)>0 or not (url ~ '^https://[a-zA-Z0-9][^[:space:]]*$' or (url like '/%' and url not like '//%'))) then raise exception 'Use um link HTTPS ou um caminho do site começando com /.'; end if;
 if length(coalesce(label,''))>60 then raise exception 'Texto do botão muito longo.'; end if;
 for recipient in select distinct unnest(p_recipients) loop
  result:=only_notifications_internal.send_icon(recipient,p_title,p_body,(md5(p_key::text||recipient::text))::uuid,p_icon);
  update public.site_notifications set link_url=url,link_label=case when url is null then null else coalesce(label,'Ver detalhes') end where id=result and sender_id=auth.uid();
  total:=total+1;
 end loop;
 return total;
end $$;

create or replace function only_notifications_internal.trash(p_id uuid,p_restore boolean) returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if auth.uid() is null then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_restore then
  update public.site_notifications set trashed_at=null where recipient_id=auth.uid() and id=p_id and trashed_at>now()-interval '3 days';
 else
  update public.site_notifications set trashed_at=now() where recipient_id=auth.uid() and (p_id is null or id=p_id) and trashed_at is null;
 end if;
 get diagnostics affected=row_count; return affected;
end $$;

create or replace function public.my_site_notifications() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unread_count',(select count(*) from public.site_notifications where read_at is null and trashed_at is null and recipient_id=auth.uid()),'items',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id desc) from (select id,title,body,icon,link_url,link_label,created_at,read_at,trashed_at from public.site_notifications where recipient_id=auth.uid() and (trashed_at is null or trashed_at>now()-interval '3 days') order by created_at desc,id desc)n),'[]'::jsonb));
$$;

create or replace function public.only_email_unsubscribe(p_token uuid)
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
    and template in ('event_countdown','checkout_recovery','ticket_photo_reminder','notification_digest');
  return true;
end;
$$;
revoke all on function public.only_email_unsubscribe(uuid) from public, anon, authenticated;
grant execute on function public.only_email_unsubscribe(uuid) to service_role;


create or replace function public.only_suppress_optional_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('pending','failed','sending')
    and new.template in ('event_countdown','checkout_recovery','ticket_photo_reminder','notification_digest')
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

alter table public.transactional_email_outbox drop constraint transactional_email_outbox_template_check;
alter table public.transactional_email_outbox add constraint transactional_email_outbox_template_check check(template in ('ticket_purchase','order_purchase','checkout_recovery','event_countdown','ticket_photo_reminder','notification_digest'));
alter table public.site_notifications add column email_batch_id bigint references public.transactional_email_outbox(id) on delete set null;
create index site_notifications_digest_pending on public.site_notifications(recipient_id) where read_at is null and trashed_at is null and email_batch_id is null;
create index site_notifications_email_batch on public.site_notifications(email_batch_id) where email_batch_id is not null;

create table only_notifications_internal.email_rollout (singleton boolean primary key default true check(singleton), enabled boolean not null default false);
alter table only_notifications_internal.email_rollout enable row level security;
revoke all on only_notifications_internal.email_rollout from public,anon,authenticated;
grant usage on schema only_notifications_internal to service_role;
grant select,update on only_notifications_internal.email_rollout to service_role;
insert into only_notifications_internal.email_rollout(singleton,enabled) values(true,false);

create function public.enqueue_notification_digests(p_user uuid default null) returns integer
language plpgsql security invoker set search_path='' as $$
declare member record; ids uuid[]; batch bigint; total integer:=0; unread integer;
begin
 if p_user is null and not (select enabled from only_notifications_internal.email_rollout where singleton) then return 0; end if;
 -- Serialize cron runs so the same notification cannot enter two batches.
 if not pg_try_advisory_xact_lock(20261013,3) then return 0; end if;
 for member in
  select p.id,p.display_name,u.email from public.profiles p join auth.users u on u.id=p.id
  where (p_user is null or p.id=p_user) and u.email_confirmed_at is not null and coalesce(u.email,'')<>''
  and not exists(select 1 from public.only_email_preferences e where e.email=lower(btrim(u.email)) and e.unsubscribed_at is not null)
  and (select count(*) from public.site_notifications n where n.recipient_id=p.id and n.read_at is null and n.trashed_at is null and n.email_batch_id is null)>=3
 loop
  select array_agg(n.id order by n.created_at,n.id) into ids from public.site_notifications n
  where n.recipient_id=member.id and n.read_at is null and n.trashed_at is null and n.email_batch_id is null;
  if cardinality(ids)<3 then continue; end if;
  select count(*) into unread from public.site_notifications where recipient_id=member.id and read_at is null and trashed_at is null;
  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  values(member.email,member.display_name,'notification_digest','Você tem '||unread||' notificações não lidas no Only',jsonb_build_object('recipient_id',member.id,'unread_count',unread),'notification-digest:'||member.id||':'||md5(ids::text))
  on conflict(dedupe_key) do nothing returning id into batch;
  if batch is not null then
   update public.site_notifications set email_batch_id=batch where id=any(ids);
   total:=total+1;
  end if;
 end loop;
 return total;
end $$;
revoke all on function public.enqueue_notification_digests(uuid) from public,anon,authenticated;
grant execute on function public.enqueue_notification_digests(uuid) to service_role;

create function public.notification_digest_status(p_batch bigint) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unread_count',count(*),'batch_unread_count',count(*) filter(where n.email_batch_id=p_batch))
 from public.site_notifications n join public.transactional_email_outbox o on o.id=p_batch
 join auth.users u on u.id=n.recipient_id
 where o.template='notification_digest' and n.recipient_id=(o.payload->>'recipient_id')::uuid
 and lower(btrim(o.recipient_email))=lower(btrim(u.email)) and u.email_confirmed_at is not null
 and n.read_at is null and n.trashed_at is null;
$$;
revoke all on function public.notification_digest_status(bigint) from public,anon,authenticated;
grant execute on function public.notification_digest_status(bigint) to service_role;
