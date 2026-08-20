-- Keep the existing store confirmation email as the single source of truth.
delete from public.transactional_email_outbox
where template='order_purchase' and status in ('pending','failed');

create or replace function public.enqueue_only_emails()
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer:=0; n integer;
begin
  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'ticket_purchase','Seu ingresso para o Only Cars Meeting está confirmado',jsonb_build_object('order_id',o.id,'ticket_code',t.ticket_code,'qr_token',t.qr_token,'event_name',e.name,'event_date',e.starts_at,'vehicle_plate',t.vehicle_plate,'driver_name',t.driver_name,'total_cents',o.payable_cents),'ticket-paid:'||o.id
  from public.ticket_orders o join public.tickets t on t.order_id=o.id join public.events e on e.id=o.event_id where o.status='paid'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'checkout_recovery','Seu ingresso ainda está esperando por você',jsonb_build_object('kind','ticket','order_id',o.id),'recover-ticket:'||o.id
  from public.ticket_orders o where o.status='pending_payment' and o.created_at<now()-interval '35 minutes' and o.created_at>now()-interval '3 days'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'checkout_recovery','Seu carrinho Only ainda está esperando',jsonb_build_object('kind','order','order_id',o.id),'recover-order:'||o.id
  from public.orders o where o.status='pending_payment' and o.created_at<now()-interval '2 hours' and o.created_at>now()-interval '3 days'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select c.email,p.display_name,'checkout_recovery','Os produtos do seu carrinho continuam aqui',jsonb_build_object('kind','cart','cart',c.cart),'recover-cart:'||c.user_id||':'||to_char(c.updated_at,'YYYYMMDD')
  from public.customer_cart_recovery c join public.profiles p on p.id=c.user_id where c.item_count>0 and c.updated_at<now()-interval '2 hours' and c.updated_at>now()-interval '3 days'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select distinct o.customer_email,o.customer_name,'event_countdown',case when d.days=1 then 'É amanhã: Only Cars Meeting' else 'Faltam '||d.days||' dias para o Only Cars Meeting' end,jsonb_build_object('days',d.days,'event_name',e.name,'event_date',e.starts_at),'countdown:'||e.id||':'||d.days||':'||lower(o.customer_email)
  from public.events e join public.ticket_orders o on o.event_id=e.id and o.status='paid' cross join (values(10),(5),(1)) d(days)
  where (e.starts_at::date-current_date)=d.days on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;
  return inserted_count;
end $$;

revoke all on function public.enqueue_only_emails() from public,anon,authenticated;
grant execute on function public.enqueue_only_emails() to service_role;
