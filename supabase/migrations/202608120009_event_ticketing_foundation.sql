-- Only Cars Club — fundação segura de eventos e ingressos.
-- Mantém ingressos separados dos pedidos da loja e não abre vendas automaticamente.

create extension if not exists pgcrypto;

do $$
begin
  create type public.event_status as enum (
    'draft', 'published', 'sales_open', 'sales_closed', 'completed', 'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ticket_order_status as enum (
    'pending_payment', 'paid', 'cancelled', 'expired', 'refunded', 'chargeback'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ticket_status as enum (
    'reserved', 'active', 'checked_in', 'cancelled', 'refunded', 'blocked'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ticket_media_status as enum (
    'pending', 'approved', 'replacement_requested', 'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ticket_checkin_type as enum (
    'entry', 'exit', 'reentry', 'undo'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  short_description text not null,
  description text not null,
  venue_name text not null,
  venue_address text not null,
  venue_city text not null,
  venue_state char(2) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sales_start_at timestamptz,
  sales_end_at timestamptz not null,
  capacity integer not null check (capacity > 0),
  complimentary_capacity integer not null default 0 check (complimentary_capacity >= 0),
  pedestrian_entry_free boolean not null default true,
  banner_url text,
  support_email text not null,
  regulation_version text not null default '1.0',
  regulation_url text,
  status public.event_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint events_dates_valid check (ends_at > starts_at),
  constraint events_sales_dates_valid check (
    sales_start_at is null or sales_end_at > sales_start_at
  ),
  constraint events_complimentary_capacity_valid check (complimentary_capacity <= capacity)
);

create table if not exists public.event_lots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  lot_number smallint not null check (lot_number > 0),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  capacity integer not null check (capacity > 0),
  sales_start_at timestamptz,
  sales_end_at timestamptz,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, lot_number),
  constraint event_lots_dates_valid check (
    sales_start_at is null or sales_end_at is null or sales_end_at > sales_start_at
  )
);

create table if not exists public.ticket_orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  lot_id uuid not null references public.event_lots(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  customer_tax_id text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  total_cents integer generated always as (quantity * unit_price_cents) stored,
  currency char(3) not null default 'BRL',
  status public.ticket_order_status not null default 'pending_payment',
  provider text not null default 'mercado_pago',
  provider_preference_id text,
  provider_payment_id text,
  payment_method text,
  payment_status public.payment_status not null default 'pending',
  payment_status_detail text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  cancelled_at timestamptz,
  regulation_version text not null,
  regulation_accepted_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index if not exists ticket_orders_event_created_idx
  on public.ticket_orders(event_id, created_at desc);
create index if not exists ticket_orders_user_created_idx
  on public.ticket_orders(user_id, created_at desc);
create index if not exists ticket_orders_status_expires_idx
  on public.ticket_orders(status, expires_at);

create table if not exists public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.ticket_orders(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  ticket_code text not null unique default (
    'OCM-' || upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8))
  ),
  qr_token_hash text not null unique,
  status public.ticket_status not null default 'reserved',
  is_complimentary boolean not null default false,
  complimentary_issued_by uuid references public.profiles(id) on delete set null,
  driver_name text not null,
  driver_tax_id text not null,
  driver_phone text not null,
  vehicle_plate text not null,
  vehicle_make text not null,
  vehicle_model text not null,
  vehicle_year smallint,
  vehicle_color text not null,
  instagram_handle text,
  first_checked_in_at timestamptz,
  last_entry_at timestamptz,
  last_exit_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_paid_or_complimentary check (
    (is_complimentary and order_id is null)
    or (not is_complimentary and order_id is not null)
  ),
  constraint tickets_vehicle_year_valid check (
    vehicle_year is null or vehicle_year between 1900 and 2100
  )
);

create unique index if not exists tickets_one_active_plate_per_event
  on public.tickets(event_id, upper(regexp_replace(vehicle_plate, '[^A-Za-z0-9]', '', 'g')))
  where status in ('reserved', 'active', 'checked_in');
create index if not exists tickets_owner_created_idx
  on public.tickets(owner_user_id, created_at desc);
create index if not exists tickets_event_status_idx
  on public.tickets(event_id, status);

create table if not exists public.ticket_checkins (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  action public.ticket_checkin_type not null,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ticket_checkins_ticket_created_idx
  on public.ticket_checkins(ticket_id, created_at desc);
create index if not exists ticket_checkins_event_created_idx
  on public.ticket_checkins(event_id, created_at desc);

create table if not exists public.ticket_media (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  instagram_handle text,
  publication_consent boolean not null default false,
  publication_consent_at timestamptz,
  status public.ticket_media_status not null default 'pending',
  admin_note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_media_consent_timestamp check (
    not publication_consent or publication_consent_at is not null
  )
);

create table if not exists public.event_coupons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null unique,
  discount_percent smallint not null check (discount_percent between 1 and 100),
  valid_until timestamptz not null,
  event_pickup_only boolean not null default true,
  used_order_id uuid references public.orders(id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger event_lots_set_updated_at before update on public.event_lots
for each row execute function public.set_updated_at();
create trigger ticket_orders_set_updated_at before update on public.ticket_orders
for each row execute function public.set_updated_at();
create trigger tickets_set_updated_at before update on public.tickets
for each row execute function public.set_updated_at();
create trigger ticket_media_set_updated_at before update on public.ticket_media
for each row execute function public.set_updated_at();

alter table public.events enable row level security;
alter table public.event_lots enable row level security;
alter table public.ticket_orders enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_checkins enable row level security;
alter table public.ticket_media enable row level security;
alter table public.event_coupons enable row level security;

create policy "events_public_read" on public.events
for select to anon, authenticated
using (status in ('published', 'sales_open', 'sales_closed', 'completed') or public.is_admin());

create policy "events_admin_manage" on public.events
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "event_lots_public_read" on public.event_lots
for select to anon, authenticated
using (
  public.is_admin() or exists (
    select 1 from public.events e
    where e.id = event_lots.event_id
      and e.status in ('published', 'sales_open', 'sales_closed', 'completed')
  )
);

create policy "event_lots_admin_manage" on public.event_lots
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "ticket_orders_select_own_or_admin" on public.ticket_orders
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "tickets_select_own_or_admin" on public.tickets
for select to authenticated
using (owner_user_id = auth.uid() or public.is_admin());

create policy "ticket_checkins_select_own_or_admin" on public.ticket_checkins
for select to authenticated
using (
  public.is_admin() or exists (
    select 1 from public.tickets t
    where t.id = ticket_checkins.ticket_id and t.owner_user_id = auth.uid()
  )
);

create policy "ticket_media_select_own_or_admin" on public.ticket_media
for select to authenticated
using (owner_user_id = auth.uid() or public.is_admin());

create policy "ticket_media_insert_own" on public.ticket_media
for insert to authenticated
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.tickets t
    where t.id = ticket_media.ticket_id
      and t.owner_user_id = auth.uid()
      and t.status in ('active', 'checked_in')
  )
);

create policy "ticket_media_update_own_pending" on public.ticket_media
for update to authenticated
using (owner_user_id = auth.uid() and status in ('pending', 'replacement_requested'))
with check (owner_user_id = auth.uid() and status = 'pending');

create policy "ticket_media_admin_manage" on public.ticket_media
for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "event_coupons_select_own_or_admin" on public.event_coupons
for select to authenticated
using (owner_user_id = auth.uid() or public.is_admin());

create or replace function public.public_event_summary(target_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', e.id,
    'slug', e.slug,
    'name', e.name,
    'short_description', e.short_description,
    'description', e.description,
    'venue_name', e.venue_name,
    'venue_address', e.venue_address,
    'venue_city', e.venue_city,
    'venue_state', e.venue_state,
    'starts_at', e.starts_at,
    'ends_at', e.ends_at,
    'sales_end_at', e.sales_end_at,
    'capacity', e.capacity,
    'complimentary_capacity', e.complimentary_capacity,
    'pedestrian_entry_free', e.pedestrian_entry_free,
    'banner_url', e.banner_url,
    'support_email', e.support_email,
    'status', e.status,
    'paid_or_reserved', (
      select count(*) from public.tickets t
      where t.event_id = e.id and t.status in ('reserved', 'active', 'checked_in')
    ),
    'remaining_public', greatest(
      e.capacity - e.complimentary_capacity - (
        select count(*) from public.tickets t
        where t.event_id = e.id
          and not t.is_complimentary
          and t.status in ('reserved', 'active', 'checked_in')
      ), 0
    ),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'lot_number', l.lot_number,
        'name', l.name,
        'price_cents', l.price_cents,
        'capacity', l.capacity,
        'active', l.active,
        'sold_or_reserved', (
          select count(*) from public.tickets t
          join public.ticket_orders o on o.id = t.order_id
          where o.lot_id = l.id and t.status in ('reserved', 'active', 'checked_in')
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

-- Evento permanece em rascunho. A publicação e a abertura das vendas serão ações separadas.
insert into public.events (
  slug, name, short_description, description,
  venue_name, venue_address, venue_city, venue_state,
  starts_at, ends_at, sales_end_at,
  capacity, complimentary_capacity, pedestrian_entry_free,
  support_email, regulation_version, status, metadata
)
values (
  'only-cars-meeting-2026',
  'Only Cars Meeting',
  'Evento automotivo para exposição de veículos, encontro da comunidade e apresentação de drift.',
  'O Only Cars Meeting reúne a comunidade automotiva em uma noite dedicada a carros, cultura e experiências. O evento contará com área de exposição para projetos de diferentes estilos, apresentação de drift e um ambiente preparado para aproximar proprietários, entusiastas, marcas e apaixonados pelo universo automotivo.',
  'Centro de Esportes Radicais',
  'Av. Presidente Castelo Branco, 5700 — Bom Retiro',
  'São Paulo',
  'SP',
  '2026-10-23 20:00:00 America/Sao_Paulo',
  '2026-10-23 23:59:00 America/Sao_Paulo',
  '2026-10-23 18:00:00 America/Sao_Paulo',
  130,
  10,
  true,
  'contato@onlycarsclub.com.br',
  '1.0',
  'draft',
  '{"opening_time_confirmed":false,"closing_time_confirmed":false,"capacity_confirmed":false,"door_sales":false,"vehicle_preapproval":false,"reentry_allowed":true,"store_coupon_percent":10,"store_coupon_valid_until":"2026-10-21T23:59:00-03:00"}'::jsonb
)
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  description = excluded.description,
  venue_name = excluded.venue_name,
  venue_address = excluded.venue_address,
  venue_city = excluded.venue_city,
  venue_state = excluded.venue_state,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  sales_end_at = excluded.sales_end_at,
  capacity = excluded.capacity,
  complimentary_capacity = excluded.complimentary_capacity,
  pedestrian_entry_free = excluded.pedestrian_entry_free,
  support_email = excluded.support_email,
  regulation_version = excluded.regulation_version,
  metadata = public.events.metadata || excluded.metadata;

with target_event as (
  select id from public.events where slug = 'only-cars-meeting-2026'
), lots(lot_number, name, price_cents, capacity, active) as (
  values
    (1, 'Lote 1', 2500, 30, false),
    (2, 'Lote 2', 3500, 40, false),
    (3, 'Lote 3', 4500, 50, false)
)
insert into public.event_lots(event_id, lot_number, name, price_cents, capacity, active)
select target_event.id, lots.lot_number, lots.name, lots.price_cents, lots.capacity, lots.active
from target_event cross join lots
on conflict (event_id, lot_number) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  capacity = excluded.capacity;

comment on table public.ticket_orders is
  'Pedidos de ingresso separados dos pedidos da loja; escritos somente por funções seguras/service_role.';
comment on column public.tickets.qr_token_hash is
  'Armazena somente o hash do token opaco usado pelo QR Code.';
comment on table public.ticket_checkins is
  'Trilha imutável de entrada, saída, reentrada e correções administrativas.';
