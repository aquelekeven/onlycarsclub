create table public.ticket_purchase_coupons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  max_redemptions_per_user integer not null default 1 check (max_redemptions_per_user > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_purchase_coupons_code_valid check (code = upper(btrim(code)) and code ~ '^[A-Z0-9_-]{3,30}$'),
  constraint ticket_purchase_coupons_value_valid check (
    (discount_type = 'percent' and discount_value between 1 and 100)
    or (discount_type = 'fixed' and discount_value >= 100)
  ),
  constraint ticket_purchase_coupons_dates_valid check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create unique index ticket_purchase_coupons_event_code_uidx
  on public.ticket_purchase_coupons(event_id, code);
create index ticket_purchase_coupons_event_active_idx
  on public.ticket_purchase_coupons(event_id, active);

alter table public.ticket_orders
  add column coupon_id uuid references public.ticket_purchase_coupons(id) on delete set null,
  add column coupon_code text,
  add column discount_cents integer not null default 0 check (discount_cents >= 0),
  add column payable_cents integer generated always as ((quantity * unit_price_cents) - discount_cents) stored,
  add constraint ticket_orders_discount_not_above_total check (discount_cents <= quantity * unit_price_cents);

create index ticket_orders_coupon_idx on public.ticket_orders(coupon_id) where coupon_id is not null;

create trigger ticket_purchase_coupons_set_updated_at before update on public.ticket_purchase_coupons
for each row execute function public.set_updated_at();

alter table public.ticket_purchase_coupons enable row level security;
revoke all on public.ticket_purchase_coupons from public, anon, authenticated;
grant select, insert, update, delete on public.ticket_purchase_coupons to service_role;

create or replace function public.preview_ticket_purchase_coupon(p_event_id uuid, p_code text, p_subtotal_cents integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.ticket_purchase_coupons;
  used_total integer;
  used_by_user integer;
  discount integer;
begin
  if auth.uid() is null then raise exception 'Faça login para aplicar um cupom.'; end if;
  if p_subtotal_cents is null or p_subtotal_cents < 100 then raise exception 'Valor do ingresso inválido.'; end if;
  select * into c from public.ticket_purchase_coupons
   where event_id = p_event_id and code = upper(btrim(p_code));
  if not found or not c.active then raise exception 'Cupom inválido ou indisponível.'; end if;
  if c.starts_at is not null and now() < c.starts_at then raise exception 'Este cupom ainda não está disponível.'; end if;
  if c.ends_at is not null and now() >= c.ends_at then raise exception 'Este cupom expirou.'; end if;

  select count(*)::integer into used_total from public.ticket_orders o
   where o.coupon_id = c.id and (o.status = 'paid' or (o.status = 'pending_payment' and o.expires_at > now()));
  select count(*)::integer into used_by_user from public.ticket_orders o
   where o.coupon_id = c.id and o.user_id = auth.uid()
     and (o.status = 'paid' or (o.status = 'pending_payment' and o.expires_at > now()));
  if c.max_redemptions is not null and used_total >= c.max_redemptions then raise exception 'Este cupom atingiu o limite de usos.'; end if;
  if used_by_user >= c.max_redemptions_per_user then raise exception 'Você já atingiu o limite de uso deste cupom.'; end if;

  discount := case when c.discount_type = 'percent'
    then floor(p_subtotal_cents * c.discount_value / 100.0)::integer
    else least(c.discount_value, p_subtotal_cents - 100) end;
  discount := greatest(0, least(discount, p_subtotal_cents - 100));
  return jsonb_build_object('valid', true, 'code', c.code, 'description', c.description,
    'discount_cents', discount, 'payable_cents', p_subtotal_cents - discount,
    'discount_type', c.discount_type, 'discount_value', c.discount_value);
end;
$$;

revoke all on function public.preview_ticket_purchase_coupon(uuid,text,integer) from public, anon;
grant execute on function public.preview_ticket_purchase_coupon(uuid,text,integer) to authenticated;

create or replace function public.reserve_ticket_purchase_coupon(p_order_id uuid, p_user_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  o public.ticket_orders;
  c public.ticket_purchase_coupons;
  used_total integer;
  used_by_user integer;
  discount integer;
begin
  select * into o from public.ticket_orders where id = p_order_id and user_id = p_user_id for update;
  if not found or o.status <> 'pending_payment' then raise exception 'Pedido indisponível para cupom.'; end if;
  select * into c from public.ticket_purchase_coupons
   where event_id = o.event_id and code = upper(btrim(p_code)) for update;
  if not found or not c.active then raise exception 'Cupom inválido ou indisponível.'; end if;
  if c.starts_at is not null and now() < c.starts_at then raise exception 'Este cupom ainda não está disponível.'; end if;
  if c.ends_at is not null and now() >= c.ends_at then raise exception 'Este cupom expirou.'; end if;
  select count(*)::integer into used_total from public.ticket_orders x
   where x.coupon_id = c.id and x.id <> o.id and (x.status = 'paid' or (x.status = 'pending_payment' and x.expires_at > now()));
  select count(*)::integer into used_by_user from public.ticket_orders x
   where x.coupon_id = c.id and x.user_id = p_user_id and x.id <> o.id
     and (x.status = 'paid' or (x.status = 'pending_payment' and x.expires_at > now()));
  if c.max_redemptions is not null and used_total >= c.max_redemptions then raise exception 'Este cupom atingiu o limite de usos.'; end if;
  if used_by_user >= c.max_redemptions_per_user then raise exception 'Você já atingiu o limite de uso deste cupom.'; end if;
  discount := case when c.discount_type = 'percent'
    then floor(o.total_cents * c.discount_value / 100.0)::integer
    else least(c.discount_value, o.total_cents - 100) end;
  discount := greatest(0, least(discount, o.total_cents - 100));
  update public.ticket_orders set coupon_id = c.id, coupon_code = c.code, discount_cents = discount where id = o.id;
  return jsonb_build_object('code', c.code, 'discount_cents', discount, 'payable_cents', o.total_cents - discount);
end;
$$;

revoke all on function public.reserve_ticket_purchase_coupon(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reserve_ticket_purchase_coupon(uuid,uuid,text) to service_role;

create or replace function public.admin_ticket_sales_summary(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Acesso negado.'; end if;
  select jsonb_build_object(
    'sold_tickets', count(*) filter (where status = 'paid'),
    'pending_orders', count(*) filter (where status = 'pending_payment' and expires_at > now()),
    'gross_revenue_cents', coalesce(sum(total_cents) filter (where status = 'paid'), 0),
    'discount_cents', coalesce(sum(discount_cents) filter (where status = 'paid'), 0),
    'net_revenue_cents', coalesce(sum(payable_cents) filter (where status = 'paid'), 0),
    'coupon_sales', count(*) filter (where status = 'paid' and coupon_id is not null)
  ) into result from public.ticket_orders where event_id = p_event_id;
  return result;
end;
$$;

create or replace function public.admin_ticket_purchase_coupons(p_event_id uuid)
returns table(id uuid, code text, description text, discount_type text, discount_value integer,
  max_redemptions integer, max_redemptions_per_user integer, starts_at timestamptz, ends_at timestamptz,
  active boolean, reserved_uses bigint, paid_uses bigint, discount_granted_cents bigint, revenue_cents bigint,
  created_at timestamptz, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado.'; end if;
  return query select c.id,c.code,c.description,c.discount_type,c.discount_value,c.max_redemptions,c.max_redemptions_per_user,
    c.starts_at,c.ends_at,c.active,
    count(o.id) filter (where o.status='pending_payment' and o.expires_at > now()),
    count(o.id) filter (where o.status='paid'),
    coalesce(sum(o.discount_cents) filter (where o.status='paid'),0),
    coalesce(sum(o.payable_cents) filter (where o.status='paid'),0),c.created_at,c.updated_at
  from public.ticket_purchase_coupons c left join public.ticket_orders o on o.coupon_id=c.id
  where c.event_id=p_event_id group by c.id order by c.created_at desc;
end;
$$;

create or replace function public.admin_save_ticket_purchase_coupon(
  p_event_id uuid, p_id uuid, p_code text, p_description text, p_discount_type text,
  p_discount_value integer, p_max_redemptions integer, p_max_redemptions_per_user integer,
  p_starts_at timestamptz, p_ends_at timestamptz, p_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare saved_id uuid;
begin
  if not public.is_admin() then raise exception 'Acesso negado.'; end if;
  if p_id is null then
    insert into public.ticket_purchase_coupons(event_id,code,description,discount_type,discount_value,max_redemptions,max_redemptions_per_user,starts_at,ends_at,active,created_by)
    values(p_event_id,upper(btrim(p_code)),nullif(btrim(p_description),''),p_discount_type,p_discount_value,p_max_redemptions,coalesce(p_max_redemptions_per_user,1),p_starts_at,p_ends_at,coalesce(p_active,true),auth.uid()) returning id into saved_id;
  else
    update public.ticket_purchase_coupons set code=upper(btrim(p_code)),description=nullif(btrim(p_description),''),discount_type=p_discount_type,
      discount_value=p_discount_value,max_redemptions=p_max_redemptions,max_redemptions_per_user=coalesce(p_max_redemptions_per_user,1),
      starts_at=p_starts_at,ends_at=p_ends_at,active=coalesce(p_active,true)
    where id=p_id and event_id=p_event_id returning id into saved_id;
    if saved_id is null then raise exception 'Cupom não encontrado.'; end if;
  end if;
  return saved_id;
end;
$$;

create or replace function public.admin_toggle_ticket_purchase_coupon(p_id uuid, p_active boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado.'; end if;
  update public.ticket_purchase_coupons set active=p_active where id=p_id;
  if not found then raise exception 'Cupom não encontrado.'; end if;
  return p_active;
end;
$$;

revoke all on function public.admin_ticket_sales_summary(uuid) from public, anon;
revoke all on function public.admin_ticket_purchase_coupons(uuid) from public, anon;
revoke all on function public.admin_save_ticket_purchase_coupon(uuid,uuid,text,text,text,integer,integer,integer,timestamptz,timestamptz,boolean) from public, anon;
revoke all on function public.admin_toggle_ticket_purchase_coupon(uuid,boolean) from public, anon;
grant execute on function public.admin_ticket_sales_summary(uuid) to authenticated;
grant execute on function public.admin_ticket_purchase_coupons(uuid) to authenticated;
grant execute on function public.admin_save_ticket_purchase_coupon(uuid,uuid,text,text,text,integer,integer,integer,timestamptz,timestamptz,boolean) to authenticated;
grant execute on function public.admin_toggle_ticket_purchase_coupon(uuid,boolean) to authenticated;
