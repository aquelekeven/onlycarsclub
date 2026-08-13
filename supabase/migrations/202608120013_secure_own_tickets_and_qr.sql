-- Isolamento estrito da área "Minha conta" e recuperação segura do QR pelo dono.
alter table public.tickets add column if not exists qr_token text;

-- Recria tokens para ingressos existentes, pois versões anteriores guardavam somente o hash.
with generated as (
  select id, gen_random_uuid()::text || gen_random_uuid()::text as token
  from public.tickets
  where qr_token is null
)
update public.tickets t
set qr_token = g.token,
    qr_token_hash = encode(digest(convert_to(g.token, 'UTF8'), 'sha256'), 'hex')
from generated g
where t.id = g.id;

alter table public.tickets alter column qr_token set not null;

create or replace function public.customer_event_tickets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'ticket_code', t.ticket_code,
    'ticket_status', t.status,
    'driver_name', t.driver_name,
    'vehicle_plate', t.vehicle_plate,
    'vehicle_make', t.vehicle_make,
    'vehicle_model', t.vehicle_model,
    'instagram_handle', t.instagram_handle,
    'qr_token', case when o.status = 'paid' and t.status in ('active','checked_in') then t.qr_token else null end,
    'order_id', o.id,
    'order_status', o.status,
    'payment_status', o.payment_status,
    'total_cents', o.total_cents,
    'created_at', o.created_at,
    'event_name', e.name,
    'event_starts_at', e.starts_at,
    'venue_name', e.venue_name,
    'lot_name', l.name
  ) order by o.created_at desc), '[]'::jsonb)
  from public.ticket_orders o
  join public.tickets t on t.order_id = o.id
  join public.events e on e.id = o.event_id
  join public.event_lots l on l.id = o.lot_id
  where o.user_id = auth.uid()
    and t.owner_user_id = auth.uid();
$$;

revoke all on function public.customer_event_tickets() from public;
grant execute on function public.customer_event_tickets() to authenticated;
