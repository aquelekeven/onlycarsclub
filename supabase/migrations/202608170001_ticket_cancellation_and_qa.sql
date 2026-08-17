-- Cancelamento seguro de reservas de ingresso e identificação de homologação.
alter table public.profiles add column if not exists is_test boolean not null default false;
comment on column public.profiles.is_test is 'Identifica contas internas de homologação, excluídas dos indicadores comerciais.';
revoke update (is_test) on table public.profiles from authenticated;

update public.profiles p set is_test = true
from auth.users u
where u.id = p.id and lower(u.email) like 'onlycarsqa%@%';

create or replace function public.customer_cancel_ticket_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  target_order public.ticket_orders;
begin
  if current_user_id is null then raise exception 'Faça login para cancelar a reserva.' using errcode='42501'; end if;
  select * into target_order from public.ticket_orders
  where id=p_order_id and user_id=current_user_id for update;
  if not found then raise exception 'Reserva não encontrada.' using errcode='P0002'; end if;
  if target_order.status <> 'pending_payment' then
    raise exception 'Somente reservas aguardando pagamento podem ser canceladas.' using errcode='P0001';
  end if;
  update public.ticket_orders set status='cancelled',payment_status='cancelled',cancelled_at=now(),updated_at=now()
  where id=p_order_id;
  update public.tickets set status='cancelled',updated_at=now()
  where order_id=p_order_id and status='reserved';
  return jsonb_build_object('cancelled',true,'order_id',p_order_id,'preference_id',target_order.provider_preference_id);
end;
$$;
revoke all on function public.customer_cancel_ticket_order(uuid) from public;
grant execute on function public.customer_cancel_ticket_order(uuid) to authenticated;

create or replace function public.customer_event_tickets()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,
    'driver_name',t.driver_name,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,
    'vehicle_model',t.vehicle_model,'instagram_handle',t.instagram_handle,
    'qr_token',case when o.status='paid' and t.status in ('active','checked_in') then t.qr_token else null end,
    'order_id',o.id,'order_status',o.status,'payment_status',o.payment_status,
    'total_cents',o.total_cents,'expires_at',o.expires_at,'created_at',o.created_at,
    'is_test',p.is_test,'event_id',e.id,'event_name',e.name,'event_starts_at',e.starts_at,
    'venue_name',e.venue_name,'lot_name',l.name
  ) order by e.starts_at desc,o.created_at desc),'[]'::jsonb)
  from public.ticket_orders o join public.tickets t on t.order_id=o.id
  join public.profiles p on p.id=o.user_id join public.events e on e.id=o.event_id
  join public.event_lots l on l.id=o.lot_id
  where o.user_id=auth.uid() and t.owner_user_id=auth.uid();
$$;
revoke all on function public.customer_event_tickets() from public;
grant execute on function public.customer_event_tickets() to authenticated;
