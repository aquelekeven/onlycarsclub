-- Only Cars Club — fundação da loja integrada
-- Execute esta migração em um projeto novo do Supabase antes de importar o catálogo.

create extension if not exists pgcrypto;

create type public.user_role as enum ('customer', 'admin');
create type public.order_status as enum (
  'pending_payment',
  'paid',
  'cancelled',
  'refunded',
  'chargeback'
);
create type public.fulfillment_status as enum (
  'new',
  'preparing',
  'ready',
  'shipped',
  'completed',
  'cancelled'
);
create type public.payment_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back'
);
create type public.shipment_status as enum (
  'pending_quote',
  'quoted',
  'waiting_label',
  'label_created',
  'posted',
  'in_transit',
  'delivered',
  'cancelled'
);
create type public.delivery_method as enum (
  'shipping',
  'event_pickup',
  'personal_pickup',
  'customer_courier'
);

create sequence public.order_number_seq start 1000;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'customer',
  display_name text,
  phone text,
  tax_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null default 'Principal',
  recipient_name text not null,
  postal_code text not null,
  street text not null,
  number text not null,
  complement text,
  neighborhood text not null,
  city text not null,
  state char(2) not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addresses_postal_code_format check (postal_code ~ '^[0-9]{8}$'),
  constraint addresses_state_format check (state ~ '^[A-Z]{2}$')
);

create unique index addresses_one_default_per_user
  on public.addresses(user_id)
  where is_default;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  category text,
  description text,
  active boolean not null default true,
  featured boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sku text not null unique,
  size text,
  color text,
  price_cents integer not null check (price_cents >= 0),
  compare_at_price_cents integer check (
    compare_at_price_cents is null or compare_at_price_cents >= price_cents
  ),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  reserved_quantity integer not null default 0 check (
    reserved_quantity >= 0 and reserved_quantity <= stock_quantity
  ),
  weight_grams integer not null check (weight_grams > 0),
  length_cm numeric(8,2) not null check (length_cm > 0),
  width_cm numeric(8,2) not null check (width_cm > 0),
  height_cm numeric(8,2) not null check (height_cm > 0),
  image_urls jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, size, color)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default (
    'ONLY-' || lpad(nextval('public.order_number_seq')::text, 6, '0')
  ),
  user_id uuid references public.profiles(id) on delete set null,
  customer_email text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_tax_id text,
  status public.order_status not null default 'pending_payment',
  fulfillment_status public.fulfillment_status not null default 'new',
  delivery_method public.delivery_method not null,
  currency char(3) not null default 'BRL',
  subtotal_cents integer not null check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer generated always as (
    subtotal_cents - discount_cents + shipping_cents
  ) stored,
  shipping_address jsonb,
  shipping_quote jsonb,
  notes text,
  expires_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_discount_not_above_subtotal check (discount_cents <= subtotal_cents),
  constraint orders_shipping_address_required check (
    delivery_method <> 'shipping' or shipping_address is not null
  )
);

create index orders_user_created_idx on public.orders(user_id, created_at desc);
create index orders_status_created_idx on public.orders(status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  sku text not null,
  size text,
  color text,
  quantity integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer generated always as (quantity * unit_price_cents) stored,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items(order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'mercado_pago',
  provider_payment_id text,
  provider_preference_id text,
  status public.payment_status not null default 'pending',
  payment_method text,
  installments integer check (installments is null or installments > 0),
  amount_cents integer not null check (amount_cents >= 0),
  currency char(3) not null default 'BRL',
  raw_status_detail text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_id)
);

create index payments_order_idx on public.payments(order_id);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null default 'melhor_envio',
  provider_order_id text,
  service_id text,
  service_name text,
  carrier_name text,
  status public.shipment_status not null default 'pending_quote',
  price_cents integer check (price_cents is null or price_cents >= 0),
  delivery_days integer check (delivery_days is null or delivery_days >= 0),
  tracking_code text,
  label_url text,
  posted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  event_type text,
  payload jsonb not null,
  signature_valid boolean not null default false,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique(provider, provider_event_id)
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger addresses_set_updated_at before update on public.addresses
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments
for each row execute function public.set_updated_at();
create trigger shipments_set_updated_at before update on public.shipments
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'));
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

alter table public.profiles enable row level security;
alter table public.addresses enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.shipments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.admin_audit_log enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

revoke update on public.profiles from authenticated;
grant update(display_name, phone, tax_id) on public.profiles to authenticated;

create policy "addresses_manage_own_or_admin" on public.addresses
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "products_public_read" on public.products
for select to anon, authenticated
using (active or public.is_admin());

create policy "variants_public_read" on public.product_variants
for select to anon, authenticated
using (active or public.is_admin());

create policy "products_admin_manage" on public.products
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "variants_admin_manage" on public.product_variants
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "orders_select_own_or_admin" on public.orders
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "order_items_select_own_or_admin" on public.order_items
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders
    where orders.id = order_items.order_id and orders.user_id = auth.uid()
  )
);

create policy "payments_select_own_or_admin" on public.payments
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders
    where orders.id = payments.order_id and orders.user_id = auth.uid()
  )
);

create policy "shipments_select_own_or_admin" on public.shipments
for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders
    where orders.id = shipments.order_id and orders.user_id = auth.uid()
  )
);

create policy "webhook_events_admin_read" on public.webhook_events
for select to authenticated
using (public.is_admin());

create policy "admin_audit_log_admin_read" on public.admin_audit_log
for select to authenticated
using (public.is_admin());

comment on table public.orders is
  'Pedidos são criados e alterados por Edge Functions com service_role; o cliente possui somente leitura dos próprios pedidos.';
comment on column public.orders.shipping_address is
  'Snapshot imutável do endereço informado no fechamento da compra.';
comment on column public.orders.shipping_quote is
  'Snapshot da cotação de frete escolhida, validada no servidor.';
