-- Conta vagas, valores e confirmações corretamente quando um pedido possui dois ingressos.
create or replace function public.sync_event_active_lot(target_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_lot public.event_lots%rowtype; next_lot_id uuid; paid_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_event_id::text, 0));
  select * into current_lot from public.event_lots
  where event_id=target_event_id and active order by lot_number limit 1 for update;
  if not found then return; end if;
  select coalesce(sum(quantity),0)::integer into paid_count
  from public.ticket_orders where lot_id=current_lot.id and status='paid';
  if paid_count < current_lot.capacity then return; end if;
  update public.event_lots set active=false,updated_at=now() where id=current_lot.id;
  select id into next_lot_id from public.event_lots
  where event_id=target_event_id and lot_number>current_lot.lot_number
  order by lot_number limit 1 for update;
  if next_lot_id is not null then
    update public.event_lots set active=true,updated_at=now() where id=next_lot_id;
  else
    update public.events set status='sales_closed',updated_at=now() where id=target_event_id;
  end if;
end $$;

create or replace function public.public_event_summary(target_slug text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id',e.id,'slug',e.slug,'name',e.name,'short_description',e.short_description,'description',e.description,
    'venue_name',e.venue_name,'venue_address',e.venue_address,'venue_city',e.venue_city,'venue_state',e.venue_state,
    'starts_at',e.starts_at,'ends_at',e.ends_at,'sales_end_at',e.sales_end_at,'capacity',e.capacity,
    'complimentary_capacity',e.complimentary_capacity,'pedestrian_entry_free',e.pedestrian_entry_free,
    'banner_url',e.banner_url,'support_email',e.support_email,'status',e.status,
    'paid_or_reserved',(select coalesce(sum(o.quantity),0) from public.ticket_orders o where o.event_id=e.id and (o.status='paid' or (o.status='pending_payment' and o.expires_at>now()))),
    'remaining_public',greatest(e.capacity-e.complimentary_capacity-(select coalesce(sum(o.quantity),0) from public.ticket_orders o where o.event_id=e.id and (o.status='paid' or (o.status='pending_payment' and o.expires_at>now()))),0),
    'lots',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'lot_number',l.lot_number,'name',l.name,'price_cents',l.price_cents,'capacity',l.capacity,'active',l.active,
      'sold_confirmed',(select coalesce(sum(o.quantity),0) from public.ticket_orders o where o.lot_id=l.id and o.status='paid'),
      'sold_or_reserved',(select coalesce(sum(o.quantity),0) from public.ticket_orders o where o.lot_id=l.id and (o.status='paid' or (o.status='pending_payment' and o.expires_at>now())))
    ) order by l.lot_number) from public.event_lots l where l.event_id=e.id),'[]'::jsonb)
  ) from public.events e where e.slug=target_slug and e.status in ('published','sales_open','sales_closed','completed');
$$;
revoke all on function public.public_event_summary(text) from public;
grant execute on function public.public_event_summary(text) to anon,authenticated;

create or replace function public.admin_ticket_sales_summary(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado.'; end if;
  select jsonb_build_object(
    'sold_tickets',(select count(*) from public.tickets t join public.ticket_orders x on x.id=t.order_id where t.event_id=p_event_id and x.status='paid'),
    'pending_orders',count(*) filter(where o.status='pending_payment' and o.expires_at>now()),
    'gross_revenue_cents',coalesce(sum(o.total_cents) filter(where o.status='paid'),0),
    'discount_cents',coalesce(sum(o.discount_cents) filter(where o.status='paid'),0),
    'net_revenue_cents',coalesce(sum(o.payable_cents) filter(where o.status='paid'),0),
    'coupon_sales',count(*) filter(where o.status='paid' and o.coupon_id is not null)
  ) into result from public.ticket_orders o where o.event_id=p_event_id;
  return result;
end $$;

create or replace function public.customer_event_tickets()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,'driver_name',t.driver_name,
    'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,
    'instagram_handle',t.instagram_handle,'qr_token',case when o.status='paid' and t.status in ('active','checked_in') then t.qr_token else null end,
    'order_id',o.id,'order_status',o.status,'payment_status',o.payment_status,
    'total_cents',round(o.payable_cents::numeric/o.quantity)::integer,'subtotal_cents',o.unit_price_cents,
    'discount_cents',round(o.discount_cents::numeric/o.quantity)::integer,'order_total_cents',o.payable_cents,
    'order_quantity',o.quantity,'coupon_code',o.coupon_code,'expires_at',o.expires_at,'created_at',o.created_at,
    'is_test',p.is_test,'event_id',e.id,'event_name',e.name,'event_starts_at',e.starts_at,
    'venue_name',e.venue_name,'age_rating',e.age_rating,'lot_name',l.name,
    'refund_request',case when r.id is null then null else jsonb_build_object('id',r.id,'status',r.status,'reason',r.reason,'details',r.details,'admin_notes',r.admin_notes,'created_at',r.created_at,'updated_at',r.updated_at) end
  ) order by e.starts_at desc,o.created_at desc,t.created_at),'[]'::jsonb)
  from public.ticket_orders o join public.tickets t on t.order_id=o.id join public.profiles p on p.id=o.user_id
  join public.events e on e.id=o.event_id join public.event_lots l on l.id=o.lot_id
  left join public.ticket_refund_requests r on r.ticket_order_id=o.id
  where o.user_id=auth.uid() and t.owner_user_id=auth.uid();
$$;
revoke all on function public.customer_event_tickets() from public,anon;
grant execute on function public.customer_event_tickets() to authenticated;

create or replace function public.admin_event_ticket_sales(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Acesso negado.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'ticket_id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,'driver_name',t.driver_name,
   'driver_tax_id',t.driver_tax_id,'driver_phone',t.driver_phone,'vehicle_plate',t.vehicle_plate,
   'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,'vehicle_year',t.vehicle_year,
   'instagram_handle',t.instagram_handle,'order_id',o.id,'customer_email',o.customer_email,
   'subtotal_cents',o.unit_price_cents,'discount_cents',round(o.discount_cents::numeric/o.quantity)::integer,
   'total_cents',round(o.payable_cents::numeric/o.quantity)::integer,'order_total_cents',o.payable_cents,
   'order_quantity',o.quantity,'coupon_code',o.coupon_code,'payment_method',o.payment_method,
   'paid_at',o.paid_at,'created_at',o.created_at,'photo',case when m.id is null then null else jsonb_build_object('storage_path',m.storage_path,'submission_count',m.submission_count,'status',m.status,'created_at',m.created_at) end
 ) order by o.created_at desc,t.created_at) from public.tickets t join public.ticket_orders o on o.id=t.order_id
 left join public.ticket_media m on m.ticket_id=t.id where t.event_id=p_event_id and o.status='paid'),'[]');
end $$;
revoke all on function public.admin_event_ticket_sales(uuid) from public,anon;
grant execute on function public.admin_event_ticket_sales(uuid) to authenticated;

create or replace function public.enqueue_only_emails()
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer:=0; n integer;
begin
  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'ticket_purchase','Seu ingresso para o Only Cars Meeting está confirmado',
    jsonb_build_object('order_id',o.id,'event_name',e.name,'event_date',e.starts_at,'driver_name',o.customer_name,
      'total_cents',o.payable_cents,'tickets',jsonb_agg(jsonb_build_object('ticket_code',t.ticket_code,'qr_token',t.qr_token,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model) order by t.created_at)),
    'ticket-paid:'||o.id
  from public.ticket_orders o join public.tickets t on t.order_id=o.id join public.events e on e.id=o.event_id
  where o.status='paid' group by o.id,e.id
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
