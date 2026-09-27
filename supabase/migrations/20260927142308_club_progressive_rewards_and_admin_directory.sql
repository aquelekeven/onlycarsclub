-- Keep v1 directory available for cached clients; v2 adds server-side ordering and admin grouping.
create function only_club_internal.user_directory(p_search text default '',p_offset integer default 0,p_sort text default 'newest') returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not only_club_internal.is_owner() then raise exception 'Acesso exclusivo do proprietário.' using errcode='42501';end if;
 if p_sort is null or p_sort not in ('newest','oldest','name_asc','name_desc') then raise exception 'Ordenação inválida.';end if;
 return (
  with matching as (
   select u.id,u.email,p.display_name,coalesce(p.role::text,'customer') as role,u.created_at,
     u.id=(select user_id from only_club_internal.owner_account) as is_owner
   from auth.users u left join public.profiles p on p.id=u.id
   where strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(left(coalesce(p_search,''),120)))>0
  ), ordered as (
   select m.*,row_number() over(order by
    case when p_sort='name_asc' then lower(coalesce(nullif(btrim(display_name),''),email,'')) end asc,
    case when p_sort='name_desc' then lower(coalesce(nullif(btrim(display_name),''),email,'')) end desc,
    case when p_sort='oldest' then created_at end asc,
    case when p_sort='newest' then created_at end desc,id) as position from matching m
  )
  select jsonb_build_object('total',count(*),'users',coalesce(jsonb_agg(to_jsonb(o)-'position' order by position) filter(where position>greatest(0,p_offset) and position<=greatest(0,p_offset)+30),'[]'::jsonb),
   'admins',coalesce(jsonb_agg(to_jsonb(o)-'position' order by position) filter(where role='admin'),'[]'::jsonb)) from ordered o
 );
end $$;
create function public.owner_user_directory(p_search text default '',p_offset integer default 0,p_sort text default 'newest') returns jsonb
language sql security invoker set search_path='' as $$ select only_club_internal.user_directory(p_search,p_offset,p_sort); $$;
revoke all on function only_club_internal.user_directory(text,integer,text),public.owner_user_directory(text,integer,text) from public,anon;
grant execute on function only_club_internal.user_directory(text,integer,text),public.owner_user_directory(text,integer,text) to authenticated;

-- A successful 40% purchase resets the cycle at the attendance count recorded when reserved.
-- Pending orders hold the benefit until explicitly cancelled (including expired payment links),
-- so a late payment cannot duplicate a use. Failed/cancelled/refunded orders release their hold.
create function only_club_internal.loyalty_state(p_user_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with totals as (select count(*)::integer as n from only_club_internal.attendance where user_id=p_user_id),
 resets as (select coalesce(max((metadata->>'loyalty_cycle_reset_count')::integer),0) as base
  from public.ticket_orders where user_id=p_user_id and status='paid' and metadata ? 'loyalty_cycle_reset_count'),
 progress as (select n,base,greatest(0,n-base) as step from totals cross join resets),
 state as (select *,exists(select 1 from public.ticket_orders where user_id=p_user_id and status='pending_payment' and metadata ? 'loyalty_cycle_reset_count') as reserved from progress)
 select jsonb_build_object('events_count',n,'cycle_start_count',base,'cycle_events_count',step,'bonus_reserved',reserved,
  'discount_percent',case when reserved then 0 when step>=10 then 40 when step>=5 then 30 else step*5 end,
  'cycle_shirts_earned',least(step,10)/5,'cycle_hoodies_earned',least(step,10)/10) from state;
$$;
create or replace function only_club_internal.discount_for(p_user_id uuid) returns integer
language sql stable security invoker set search_path='' as $$ select (only_club_internal.loyalty_state(p_user_id)->>'discount_percent')::integer; $$;
create or replace function only_club_internal.loyalty() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;ev jsonb;n integer;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501';end if;
 result:=only_club_internal.loyalty_state(auth.uid());n:=(result->>'events_count')::integer;
 select coalesce(jsonb_agg(jsonb_build_object('id',event_id,'name',name,'starts_at',starts_at,'attended_at',attended_at) order by starts_at desc),'[]'::jsonb)
 into ev from only_club_internal.attendance where user_id=auth.uid();
 return result||jsonb_build_object('events',ev,'shirts_earned',n/5,'hoodies_earned',n/10);
end $$;
create function only_club_internal.loyalty_for_event(p_user_id uuid,p_event_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 with state as(select only_club_internal.loyalty_state(p_user_id) as value),
 used as(select exists(select 1 from public.ticket_orders where user_id=p_user_id and event_id=p_event_id
   and status in ('paid','pending_payment') and coalesce((metadata->>'loyalty_discount_percent')::integer,0)>0) as taken)
 select value||jsonb_build_object('event_used',taken,'discount_percent',case when taken then 0 else (value->>'discount_percent')::integer end) from state cross join used;
$$;
create function only_club_internal.preview_loyalty(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501';end if;
 if not exists(select 1 from public.events where id=p_event_id) then raise exception 'Evento não encontrado.';end if;
 return only_club_internal.loyalty_for_event(auth.uid(),p_event_id);
end $$;
create function public.customer_event_loyalty(p_event_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select only_club_internal.preview_loyalty(p_event_id); $$;
revoke all on function only_club_internal.loyalty_state(uuid),only_club_internal.loyalty_for_event(uuid,uuid),only_club_internal.preview_loyalty(uuid),public.customer_event_loyalty(uuid) from public,anon,authenticated;
grant execute on function only_club_internal.loyalty_state(uuid),only_club_internal.loyalty_for_event(uuid,uuid) to service_role;
grant execute on function only_club_internal.preview_loyalty(uuid),public.customer_event_loyalty(uuid) to authenticated;
create index if not exists ticket_orders_loyalty_user_event_idx on public.ticket_orders(user_id,event_id) where metadata ? 'loyalty_discount_percent';
create or replace function only_club_internal.ranking() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Ranking restrito aos administradores.' using errcode='42501';end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from (
 select dense_rank() over(order by count(*) desc) as position,a.user_id,p.display_name,count(*) as events_count,
 only_club_internal.discount_for(a.user_id) as discount_percent
 from only_club_internal.attendance a join public.profiles p on p.id=a.user_id
 group by a.user_id,p.display_name order by count(*) desc,p.display_name,a.user_id limit 200
 ) r),'[]'::jsonb);
end $$;

CREATE OR REPLACE FUNCTION public.service_reserve_typed_tickets(p_user_id uuid, p_event_slug text, p_lot_id uuid, p_buyer jsonb, p_tickets jsonb, p_coupon_code text DEFAULT NULL::text, p_expected_subtotal integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.events%rowtype; l public.event_lots%rowtype; item jsonb; kind text; qty integer; expo_qty integer:=0; ride_qty integer:=0; subtotal integer:=0; price integer; occupied integer; event_occupied integer; order_id uuid; token text; plate text; coupon jsonb; item_prices integer[]:='{}'; i integer:=0; payable integer; loyalty_percent integer; loyalty_discount integer; loyalty_state jsonb; loyalty_price integer;
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
 if p_buyer ? 'expected_payable_cents' and (p_buyer->>'expected_payable_cents')::integer is distinct from payable then
  raise exception 'Seu desconto ou total mudou. Atualize a página e confira o valor antes de pagar.';
 end if;
 for item in select value from jsonb_array_elements(p_tickets) loop
  i:=i+1;kind:=coalesce(item->>'ticket_kind','expo');token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.tickets(order_id,event_id,owner_user_id,qr_token,qr_token_hash,status,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,instagram_handle,ticket_kind,face_price_cents)
  values(order_id,e.id,p_user_id,token,encode(extensions.digest(convert_to(token,'UTF8'),'sha256'),'hex'),'reserved',left(item->>'driver_name',120),item->>'driver_tax_id',item->>'driver_phone',case when kind='carona' then '' else upper(regexp_replace(item->>'vehicle_plate','[^A-Za-z0-9]','','g')) end,case when kind='carona' then '' else left(item->>'vehicle_make',60) end,case when kind='carona' then '' else left(item->>'vehicle_model',80) end,nullif(left(item->>'instagram_handle',40),''),kind,item_prices[i]);
 end loop;
 return jsonb_build_object('order_id',order_id,'total_cents',payable,'subtotal_cents',subtotal,'coupon_code',coupon->>'code','ticket_count',qty,'event_name',e.name,'loyalty_discount_percent',case when coupon is null and loyalty_discount>0 then loyalty_percent else 0 end);
end $function$
