create or replace function public.admin_ticket_refund_requests(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'status',r.status,'reason',r.reason,'details',r.details,'admin_notes',r.admin_notes,
    'created_at',r.created_at,'updated_at',r.updated_at,'ticket_order_id',o.id,
    'ticket_code',t.ticket_code,'driver_name',t.driver_name,'vehicle_plate',t.vehicle_plate,
    'customer_email',o.customer_email,'total_cents',o.payable_cents
  ) order by r.created_at desc),'[]'::jsonb) else '[]'::jsonb end
  from public.ticket_refund_requests r
  join public.ticket_orders o on o.id = r.ticket_order_id
  join public.tickets t on t.order_id = o.id
  where o.event_id = p_event_id;
$$;

create or replace function public.customer_event_tickets()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,
    'driver_name',t.driver_name,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,
    'vehicle_model',t.vehicle_model,'instagram_handle',t.instagram_handle,
    'qr_token',case when o.status='paid' and t.status in ('active','checked_in') then t.qr_token else null end,
    'order_id',o.id,'order_status',o.status,'payment_status',o.payment_status,
    'total_cents',o.payable_cents,'subtotal_cents',o.total_cents,'discount_cents',o.discount_cents,
    'coupon_code',o.coupon_code,'expires_at',o.expires_at,'created_at',o.created_at,
    'is_test',p.is_test,'event_id',e.id,'event_name',e.name,'event_starts_at',e.starts_at,
    'venue_name',e.venue_name,'age_rating',e.age_rating,'lot_name',l.name,
    'refund_request',case when r.id is null then null else jsonb_build_object(
      'id',r.id,'status',r.status,'reason',r.reason,'details',r.details,
      'admin_notes',r.admin_notes,'created_at',r.created_at,'updated_at',r.updated_at
    ) end
  ) order by e.starts_at desc,o.created_at desc),'[]'::jsonb)
  from public.ticket_orders o join public.tickets t on t.order_id=o.id
  join public.profiles p on p.id=o.user_id join public.events e on e.id=o.event_id
  join public.event_lots l on l.id=o.lot_id
  left join public.ticket_refund_requests r on r.ticket_order_id=o.id
  where o.user_id=auth.uid() and t.owner_user_id=auth.uid();
$$;

revoke all on function public.admin_ticket_refund_requests(uuid) from public, anon;
revoke all on function public.customer_event_tickets() from public, anon;
grant execute on function public.admin_ticket_refund_requests(uuid) to authenticated;
grant execute on function public.customer_event_tickets() to authenticated;
