alter table public.transactional_email_outbox
  drop constraint transactional_email_outbox_template_check;
alter table public.transactional_email_outbox
  add constraint transactional_email_outbox_template_check
  check(template in ('ticket_purchase','order_purchase','checkout_recovery','event_countdown','ticket_photo_reminder'));

create or replace function public.enqueue_ticket_photo_reminders()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare inserted_count integer:=0;
begin
  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'ticket_photo_reminder','Mostre seu carro no post de confirmados',
    jsonb_build_object('ticket_id',t.id,'ticket_code',t.ticket_code,'driver_name',t.driver_name,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,'event_name',e.name,'event_date',e.starts_at),
    'ticket-photo-reminder:'||t.id
  from public.tickets t
  join public.ticket_orders o on o.id=t.order_id and o.status='paid'
  join public.events e on e.id=t.event_id and e.starts_at>now()
  join public.profiles p on p.id=o.user_id and not coalesce(p.is_test,false)
  left join public.ticket_media tm on tm.ticket_id=t.id
  where tm.id is null and coalesce(o.paid_at,o.created_at)<now()-interval '6 hours'
  on conflict(dedupe_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $$;

revoke all on function public.enqueue_ticket_photo_reminders() from public,anon,authenticated;
grant execute on function public.enqueue_ticket_photo_reminders() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='process-only-emails-every-10-minutes';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
end $$;

select cron.schedule(
  'process-only-emails-every-10-minutes',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url:='https://wxxgcnyolpioyiaepkvs.supabase.co/functions/v1/process-only-emails',
      headers:=jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='email_cron_anon_key'),
        'x-only-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='email_cron_secret')
      ),
      body:='{}'::jsonb,
      timeout_milliseconds:=30000
    );
  $cron$
);
