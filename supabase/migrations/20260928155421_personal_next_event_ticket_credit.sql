-- One-time ticket credit, bound to an auth user and the first later published event.
-- The table is private; browsers can only read their own status through the guarded RPC.
create table only_club_internal.ticket_account_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_order_id uuid not null unique references public.ticket_orders(id) on delete restrict,
  source_event_id uuid not null references public.events(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  reserved_order_id uuid unique references public.ticket_orders(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ticket_account_credit_distinct_orders check (reserved_order_id is distinct from source_order_id)
);
create index ticket_account_credits_user_idx on only_club_internal.ticket_account_credits(user_id);
alter table only_club_internal.ticket_account_credits enable row level security;
revoke all on only_club_internal.ticket_account_credits from public, anon, authenticated;
grant select, update on only_club_internal.ticket_account_credits to service_role;

create function only_club_internal.ticket_credit_status(p_event_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c only_club_internal.ticket_account_credits%rowtype; next_event uuid; reserved_status text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
  select * into c from only_club_internal.ticket_account_credits where user_id=auth.uid() order by created_at limit 1;
  if not found then return jsonb_build_object('balance_cents',0,'available_cents',0,'reserved',false); end if;
  select e.id into next_event from public.events e join public.events source on source.id=c.source_event_id
    where e.starts_at>source.starts_at and e.status not in ('draft','cancelled')
    order by e.starts_at,e.id limit 1;
  select o.status::text into reserved_status from public.ticket_orders o where o.id=c.reserved_order_id;
  return jsonb_build_object(
    'balance_cents',case when reserved_status='paid' then 0 else c.amount_cents end,
    'available_cents',case when p_event_id=next_event and reserved_status is distinct from 'paid' and reserved_status is distinct from 'pending_payment' then c.amount_cents else 0 end,
    'reserved',coalesce(reserved_status='pending_payment',false),
    'eligible_event_id',next_event
  );
end $$;
create function public.customer_ticket_credit_status(p_event_id uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  select only_club_internal.ticket_credit_status(p_event_id);
$$;
revoke all on function only_club_internal.ticket_credit_status(uuid),public.customer_ticket_credit_status(uuid) from public,anon,authenticated;
grant execute on function only_club_internal.ticket_credit_status(uuid),public.customer_ticket_credit_status(uuid) to authenticated;

create function only_club_internal.reserve_ticket_credit(p_order_id uuid,p_user_id uuid,p_event_id uuid,p_payable_cents integer)
returns integer language plpgsql security invoker set search_path='' as $$
declare c only_club_internal.ticket_account_credits%rowtype; next_event uuid; reserved_status text; applied integer;
begin
  select * into c from only_club_internal.ticket_account_credits where user_id=p_user_id order by created_at limit 1 for update;
  if not found then return 0; end if;
  select e.id into next_event from public.events e join public.events source on source.id=c.source_event_id
    where e.starts_at>source.starts_at and e.status not in ('draft','cancelled')
    order by e.starts_at,e.id limit 1;
  if p_event_id is distinct from next_event then return 0; end if;
  select o.status::text into reserved_status from public.ticket_orders o where o.id=c.reserved_order_id;
  if reserved_status in ('paid','pending_payment') then return 0; end if;
  applied:=least(c.amount_cents,greatest(0,p_payable_cents-100));
  if applied<=0 then return 0; end if;
  update public.ticket_orders set discount_cents=discount_cents+applied,
    metadata=metadata||jsonb_build_object('account_credit_id',c.id,'account_credit_cents',applied)
    where id=p_order_id and user_id=p_user_id and event_id=p_event_id and status='pending_payment';
  if not found then raise exception 'Pedido indisponível para crédito.'; end if;
  update only_club_internal.ticket_account_credits set reserved_order_id=p_order_id where id=c.id;
  return applied;
end $$;
revoke all on function only_club_internal.reserve_ticket_credit(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function only_club_internal.reserve_ticket_credit(uuid,uuid,uuid,integer) to service_role;

-- The final server price adds this account credit after choosing the larger of loyalty and coupon.
CREATE OR REPLACE FUNCTION public.service_reserve_typed_tickets(p_user_id uuid, p_event_slug text, p_lot_id uuid, p_buyer jsonb, p_tickets jsonb, p_coupon_code text DEFAULT NULL::text, p_expected_subtotal integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.events%rowtype; l public.event_lots%rowtype; item jsonb; kind text; qty integer; expo_qty integer:=0; ride_qty integer:=0; subtotal integer:=0; price integer; occupied integer; event_occupied integer; order_id uuid; token text; plate text; coupon jsonb; item_prices integer[]:='{}'; i integer:=0; payable integer; loyalty_percent integer; loyalty_discount integer; loyalty_state jsonb; loyalty_price integer; credit_applied integer;
begin
 if jsonb_typeof(p_tickets) is distinct from 'array' then raise exception 'Seleção de ingressos inválida.'; end if;
 qty:=jsonb_array_length(p_tickets);
 if qty<1 or qty>10 then raise exception 'Escolha entre 1 e 10 ingressos por pedido.'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and birth_date <= (current_date-interval '18 years')::date) then raise exception 'A compra exige uma conta de maior de 18 anos.'; end if;
 if nullif(btrim(p_buyer->>'name'),'') is null or coalesce(p_buyer->>'tax_id','') !~ '^\d{11}$' or coalesce(p_buyer->>'phone','') !~ '^\d{10,11}$' or nullif(p_buyer->>'email','') is null then raise exception 'Dados do comprador inválidos.'; end if;
 -- Serialize benefit use for this account across every event, including the cycle bonus.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('only-loyalty:'||p_user_id::text,0));
 -- Event row serializes reservations across all modalities and lots.
 select * into e from public.events where slug=p_event_slug for update;
 if not found or e.status<>'sales_open' or e.sales_end_at<=now() then raise exception 'As vendas deste evento estão indisponíveis.'; end if;
 for item in select value from jsonb_array_elements(p_tickets) loop
  kind:=coalesce(item->>'ticket_kind','expo');
  if kind not in ('expo','carona','combo') then raise exception 'Modalidade de ingresso inválida.'; end if;
  if nullif(btrim(item->>'driver_name'),'') is null or coalesce(item->>'driver_tax_id','') !~ '^\d{11}$' or coalesce(item->>'driver_phone','') !~ '^\d{10,11}$' then raise exception 'Confira os dados dos participantes.'; end if;
  if kind in ('expo','combo') then expo_qty:=expo_qty+1; end if;
  if kind in ('carona','combo') then ride_qty:=ride_qty+1; end if;
 end loop;
 if ride_qty>0 and not e.carona_sales_enabled then raise exception 'A Carona Radical não está disponível.'; end if;
 -- All event purchase coupons work across Expo, Carona and combo. The combo base price already includes its event discount.
 if expo_qty>0 then
  select * into l from public.event_lots where event_id=e.id and active order by lot_number limit 1 for update;
  if not found or l.id is distinct from p_lot_id then raise exception 'O lote mudou. Volte ao evento e confira os valores.'; end if;
  select coalesce(sum(coalesce(o.expo_quantity,o.quantity)),0) into occupied from public.ticket_orders o where o.lot_id=l.id and (o.status='paid' or(o.status='pending_payment' and o.expires_at>now()));
  select coalesce(sum(coalesce(o.expo_quantity,o.quantity)),0) into event_occupied from public.ticket_orders o where o.event_id=e.id and (o.status='paid' or(o.status='pending_payment' and o.expires_at>now()));
  if occupied+expo_qty>l.capacity or event_occupied+expo_qty>e.capacity-e.complimentary_capacity then raise exception 'Não há vagas Expo suficientes para este pedido.'; end if;
 end if;
 for item in select value from jsonb_array_elements(p_tickets) loop
  kind:=coalesce(item->>'ticket_kind','expo');plate:=upper(regexp_replace(coalesce(item->>'vehicle_plate',''),'[^A-Za-z0-9]','','g'));
  if kind in ('expo','combo') then
   if length(plate)<>7 or nullif(btrim(item->>'vehicle_make'),'') is null or nullif(btrim(item->>'vehicle_model'),'') is null then raise exception 'Confira placa, marca e modelo do veículo.'; end if;
   if exists(select 1 from public.tickets t where t.event_id=e.id and t.ticket_kind in ('expo','combo') and upper(regexp_replace(t.vehicle_plate,'[^A-Za-z0-9]','','g'))=plate and t.status in ('reserved','active','checked_in')) then raise exception 'Esta placa já possui um ingresso ativo ou reservado.'; end if;
  end if;
  price:=case kind when 'expo' then l.price_cents when 'carona' then e.carona_price_cents else round((l.price_cents+e.carona_price_cents)*(100-e.combo_discount_percent)/100.0)::integer end;
  item_prices:=array_append(item_prices,price);subtotal:=subtotal+price;
 end loop;
 if p_expected_subtotal is not null and p_expected_subtotal<>subtotal then raise exception 'Os preços mudaram. Atualize o pedido antes de pagar.'; end if;
 insert into public.ticket_orders(event_id,lot_id,user_id,customer_name,customer_email,customer_phone,customer_tax_id,quantity,unit_price_cents,items_subtotal_cents,expo_quantity,carona_quantity,expires_at,regulation_version,regulation_accepted_at,metadata)
 values(e.id,case when expo_qty>0 then l.id else null end,p_user_id,left(p_buyer->>'name',120),p_buyer->>'email',p_buyer->>'phone',p_buyer->>'tax_id',qty,case when expo_qty=qty and ride_qty=0 then l.price_cents else 0 end,subtotal,expo_qty,ride_qty,now()+interval '30 minutes',e.regulation_version,now(),jsonb_build_object('checkout_version','typed-v1','combo_discount_percent',e.combo_discount_percent)) returning id into order_id;
 payable:=subtotal;
 if nullif(btrim(p_coupon_code),'') is not null then
  coupon:=public.reserve_ticket_purchase_coupon(order_id,p_user_id,p_coupon_code);payable:=(coupon->>'payable_cents')::integer;
 end if;
 loyalty_state:=only_club_internal.loyalty_for_event(p_user_id,e.id);
 loyalty_percent:=(loyalty_state->>'discount_percent')::integer;
 select max(v) into loyalty_price from unnest(item_prices) as v;
 loyalty_discount:=round(loyalty_price*loyalty_percent/100.0)::integer;
 if loyalty_discount>0 and loyalty_discount>=subtotal-payable then
  update public.ticket_orders set discount_cents=loyalty_discount,coupon_id=null,coupon_code=null,
    metadata=metadata||jsonb_build_object('loyalty_discount_percent',loyalty_percent,'loyalty_discount_cents',loyalty_discount,'loyalty_ticket_count',1,'loyalty_ticket_price_cents',loyalty_price,'loyalty_rules_version',2)
     ||case when loyalty_percent=40 then jsonb_build_object('loyalty_cycle_reset_count',(loyalty_state->>'events_count')::integer) else '{}'::jsonb end
  where id=order_id;
  payable:=subtotal-loyalty_discount;coupon:=null;
 end if;
 credit_applied:=only_club_internal.reserve_ticket_credit(order_id,p_user_id,e.id,payable);
 payable:=payable-credit_applied;
 if p_buyer ? 'expected_payable_cents' and (p_buyer->>'expected_payable_cents')::integer is distinct from payable then
  raise exception 'Seu desconto ou total mudou. Atualize a página e confira o valor antes de pagar.';
 end if;
 for item in select value from jsonb_array_elements(p_tickets) loop
  i:=i+1;kind:=coalesce(item->>'ticket_kind','expo');token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.tickets(order_id,event_id,owner_user_id,qr_token,qr_token_hash,status,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,instagram_handle,ticket_kind,face_price_cents)
  values(order_id,e.id,p_user_id,token,encode(extensions.digest(convert_to(token,'UTF8'),'sha256'),'hex'),'reserved',left(item->>'driver_name',120),item->>'driver_tax_id',item->>'driver_phone',case when kind='carona' then '' else upper(regexp_replace(item->>'vehicle_plate','[^A-Za-z0-9]','','g')) end,case when kind='carona' then '' else left(item->>'vehicle_make',60) end,case when kind='carona' then '' else left(item->>'vehicle_model',80) end,nullif(left(item->>'instagram_handle',40),''),kind,item_prices[i]);
 end loop;
 return jsonb_build_object('order_id',order_id,'total_cents',payable,'subtotal_cents',subtotal,'coupon_code',coupon->>'code','ticket_count',qty,'event_name',e.name,'loyalty_discount_percent',case when coupon is null and loyalty_discount>0 then loyalty_percent else 0 end,'account_credit_cents',credit_applied);
end $function$
;
