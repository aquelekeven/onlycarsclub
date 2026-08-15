-- Virada automática dos lotes após a confirmação do último pagamento.
create or replace function public.sync_event_active_lot(target_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_lot public.event_lots%rowtype;
  next_lot_id uuid;
  paid_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_event_id::text, 0));

  select * into current_lot
  from public.event_lots
  where event_id = target_event_id and active
  order by lot_number
  limit 1
  for update;

  if not found then return; end if;

  select count(*) into paid_count
  from public.ticket_orders
  where lot_id = current_lot.id and status = 'paid';

  if paid_count < current_lot.capacity then return; end if;

  update public.event_lots set active = false, updated_at = now()
  where id = current_lot.id;

  select id into next_lot_id
  from public.event_lots
  where event_id = target_event_id and lot_number > current_lot.lot_number
  order by lot_number
  limit 1
  for update;

  if next_lot_id is not null then
    update public.event_lots set active = true, updated_at = now()
    where id = next_lot_id;
  else
    update public.events set status = 'sales_closed', updated_at = now()
    where id = target_event_id;
  end if;
end;
$$;

create or replace function public.ticket_order_advance_lot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'paid' and old.status is distinct from new.status then
    perform public.sync_event_active_lot(new.event_id);
  end if;
  return new;
end;
$$;

drop trigger if exists ticket_orders_advance_lot on public.ticket_orders;
create trigger ticket_orders_advance_lot
after update of status on public.ticket_orders
for each row execute function public.ticket_order_advance_lot();

revoke all on function public.sync_event_active_lot(uuid) from public;
revoke all on function public.ticket_order_advance_lot() from public;

create or replace function public.public_event_summary(target_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id, 'slug', e.slug, 'name', e.name,
    'short_description', e.short_description, 'description', e.description,
    'venue_name', e.venue_name, 'venue_address', e.venue_address,
    'venue_city', e.venue_city, 'venue_state', e.venue_state,
    'starts_at', e.starts_at, 'ends_at', e.ends_at, 'sales_end_at', e.sales_end_at,
    'capacity', e.capacity, 'complimentary_capacity', e.complimentary_capacity,
    'pedestrian_entry_free', e.pedestrian_entry_free, 'banner_url', e.banner_url,
    'support_email', e.support_email, 'status', e.status,
    'paid_or_reserved', (
      select count(*) from public.ticket_orders o
      where o.event_id = e.id and (
        o.status = 'paid' or (o.status = 'pending_payment' and o.expires_at > now())
      )
    ),
    'remaining_public', greatest(e.capacity - e.complimentary_capacity - (
      select count(*) from public.ticket_orders o
      where o.event_id = e.id and (
        o.status = 'paid' or (o.status = 'pending_payment' and o.expires_at > now())
      )
    ), 0),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'lot_number', l.lot_number, 'name', l.name,
        'price_cents', l.price_cents, 'capacity', l.capacity, 'active', l.active,
        'sold_confirmed', (
          select count(*) from public.ticket_orders o
          where o.lot_id = l.id and o.status = 'paid'
        ),
        'sold_or_reserved', (
          select count(*) from public.ticket_orders o
          where o.lot_id = l.id and (
            o.status = 'paid' or (o.status = 'pending_payment' and o.expires_at > now())
          )
        )
      ) order by l.lot_number)
      from public.event_lots l where l.event_id = e.id
    ), '[]'::jsonb)
  )
  from public.events e
  where e.slug = target_slug
    and e.status in ('published', 'sales_open', 'sales_closed', 'completed');
$$;

revoke all on function public.public_event_summary(text) from public;
grant execute on function public.public_event_summary(text) to anon, authenticated;
