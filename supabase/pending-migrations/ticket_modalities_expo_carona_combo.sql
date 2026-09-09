-- Typed ticket purchases; legacy orders keep their existing quantities and amounts.
alter table public.events add column carona_price_cents integer not null default 18000 check(carona_price_cents>=100), add column carona_sales_enabled boolean not null default false, add column combo_discount_percent integer not null default 10 check(combo_discount_percent between 0 and 100);
update public.events set carona_sales_enabled=true where slug='only-cars-meeting-2026';
alter table public.ticket_orders add column items_subtotal_cents integer check(items_subtotal_cents>=0), add column expo_quantity integer check(expo_quantity>=0 and expo_quantity<=quantity), add column carona_quantity integer not null default 0 check(carona_quantity>=0 and carona_quantity<=quantity), alter column lot_id drop not null;
alter table public.ticket_orders alter column total_cents set expression as (coalesce(items_subtotal_cents,quantity*unit_price_cents));
alter table public.ticket_orders alter column payable_cents set expression as (coalesce(items_subtotal_cents,quantity*unit_price_cents)-discount_cents);
alter table public.ticket_orders drop constraint ticket_orders_discount_not_above_total;
alter table public.ticket_orders add constraint ticket_orders_discount_not_above_total check(discount_cents<=coalesce(items_subtotal_cents,quantity*unit_price_cents));
alter table public.tickets add column ticket_kind text not null default 'expo' check(ticket_kind in ('expo','carona','combo')), add column face_price_cents integer check(face_price_cents>=0), add column carona_redeemed_at timestamptz, add column carona_redeemed_by uuid references public.profiles(id);
-- Carona has no vehicle. Keep the existing uniqueness guarantee for Expo and combo.
drop index public.tickets_one_active_plate_per_event;
create unique index tickets_one_active_plate_per_event on public.tickets(event_id,upper(regexp_replace(vehicle_plate,'[^A-Za-z0-9]','','g'))) where status in ('reserved','active','checked_in') and ticket_kind in ('expo','combo');
create index tickets_carona_redeemed_by_idx on public.tickets(carona_redeemed_by) where carona_redeemed_by is not null;

-- This API can only be called by the authenticated Edge Function's service client.
-- SECURITY INVOKER preserves permissions; no new public privileged write endpoint.
create function public.service_reserve_typed_tickets(p_user_id uuid,p_event_slug text,p_lot_id uuid,p_buyer jsonb,p_tickets jsonb,p_coupon_code text default null,p_expected_subtotal integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare e public.events%rowtype; l public.event_lots%rowtype; item jsonb; kind text; qty integer; expo_qty integer:=0; ride_qty integer:=0; subtotal integer:=0; price integer; occupied integer; event_occupied integer; order_id uuid; token text; plate text; coupon jsonb; item_prices integer[]:='{}'; i integer:=0; payable integer;
begin
 if jsonb_typeof(p_tickets) is distinct from 'array' then raise exception 'Seleção de ingressos inválida.'; end if;
 qty:=jsonb_array_length(p_tickets);
 if qty<1 or qty>10 then raise exception 'Escolha entre 1 e 10 ingressos por pedido.'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id and birth_date <= (current_date-interval '18 years')::date) then raise exception 'A compra exige uma conta de maior de 18 anos.'; end if;
 if nullif(btrim(p_buyer->>'name'),'') is null or coalesce(p_buyer->>'tax_id','') !~ '^\d{11}$' or coalesce(p_buyer->>'phone','') !~ '^\d{10,11}$' or nullif(p_buyer->>'email','') is null then raise exception 'Dados do comprador inválidos.'; end if;
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
 if ride_qty>0 and nullif(btrim(p_coupon_code),'') is not null then raise exception 'Cupons avulsos são válidos somente para pedidos Expo. O combo já tem desconto automático.'; end if;
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
 for item in select value from jsonb_array_elements(p_tickets) loop
  i:=i+1;kind:=coalesce(item->>'ticket_kind','expo');token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.tickets(order_id,event_id,owner_user_id,qr_token,qr_token_hash,status,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,instagram_handle,ticket_kind,face_price_cents)
  values(order_id,e.id,p_user_id,token,encode(extensions.digest(convert_to(token,'UTF8'),'sha256'),'hex'),'reserved',left(item->>'driver_name',120),item->>'driver_tax_id',item->>'driver_phone',case when kind='carona' then '' else upper(regexp_replace(item->>'vehicle_plate','[^A-Za-z0-9]','','g')) end,case when kind='carona' then '' else left(item->>'vehicle_make',60) end,case when kind='carona' then '' else left(item->>'vehicle_model',80) end,nullif(left(item->>'instagram_handle',40),''),kind,item_prices[i]);
 end loop;
 return jsonb_build_object('order_id',order_id,'total_cents',payable,'subtotal_cents',subtotal,'coupon_code',coupon->>'code','ticket_count',qty,'event_name',e.name);
end $$;
revoke all on function public.service_reserve_typed_tickets(uuid,text,uuid,jsonb,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.service_reserve_typed_tickets(uuid,text,uuid,jsonb,jsonb,text,integer) to service_role;

create schema only_ticket_internal;
revoke all on schema only_ticket_internal from public;
grant usage on schema only_ticket_internal to authenticated;
create function only_ticket_internal.redeem_carona(p_qr_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito aos administradores.' using errcode='42501'; end if;
 select * into t from public.tickets where qr_token_hash=encode(extensions.digest(convert_to(btrim(p_qr_token),'UTF8'),'sha256'),'hex') for update;
 if not found or t.ticket_kind not in ('carona','combo') then raise exception 'Este ingresso não inclui Carona Radical.'; end if;
 if t.carona_redeemed_at is not null then raise exception 'Esta Carona já foi utilizada.'; end if;
 if t.status not in ('active','checked_in') or not exists(select 1 from public.ticket_orders where id=t.order_id and status='paid') then raise exception 'A Carona exige um ingresso pago e ativo.'; end if;
 update public.tickets set carona_redeemed_at=now(),carona_redeemed_by=auth.uid() where id=t.id;
 return public.admin_inspect_event_ticket(p_qr_token);
end $$;
revoke all on function only_ticket_internal.redeem_carona(text) from public,anon;
grant execute on function only_ticket_internal.redeem_carona(text) to authenticated;
create function public.admin_redeem_carona(p_qr_token text) returns jsonb language sql security invoker set search_path='' as $$ select only_ticket_internal.redeem_carona(p_qr_token); $$;
revoke all on function public.admin_redeem_carona(text) from public,anon;
grant execute on function public.admin_redeem_carona(text) to authenticated;


CREATE OR REPLACE FUNCTION public.public_event_summary(target_slug text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'id',e.id,'slug',e.slug,'name',e.name,'short_description',e.short_description,'description',e.description,
    'venue_name',e.venue_name,'venue_address',e.venue_address,'venue_city',e.venue_city,'venue_state',e.venue_state,
    'starts_at',e.starts_at,'ends_at',e.ends_at,'sales_end_at',e.sales_end_at,'capacity',e.capacity,
    'complimentary_capacity',e.complimentary_capacity,'pedestrian_entry_free',e.pedestrian_entry_free,
    'carona_price_cents',e.carona_price_cents,'carona_sales_enabled',e.carona_sales_enabled,'combo_discount_percent',e.combo_discount_percent,'banner_url',e.banner_url,'support_email',e.support_email,'status',e.status,
    'paid_or_reserved',(select coalesce(sum(coalesce(o.expo_quantity,o.quantity)),0) from public.ticket_orders o where o.event_id=e.id and (o.status='paid' or (o.status='pending_payment' and o.expires_at>now()))),
    'remaining_public',greatest(e.capacity-e.complimentary_capacity-(select coalesce(sum(coalesce(o.expo_quantity,o.quantity)),0) from public.ticket_orders o where o.event_id=e.id and (o.status='paid' or (o.status='pending_payment' and o.expires_at>now()))),0),
    'lots',coalesce((select jsonb_agg(jsonb_build_object(
      'id',l.id,'lot_number',l.lot_number,'name',l.name,'price_cents',l.price_cents,'capacity',l.capacity,'active',l.active,
      'sold_confirmed',(select coalesce(sum(coalesce(o.expo_quantity,o.quantity)),0) from public.ticket_orders o where o.lot_id=l.id and o.status='paid'),
      'sold_or_reserved',(select coalesce(sum(coalesce(o.expo_quantity,o.quantity)),0) from public.ticket_orders o where o.lot_id=l.id and (o.status='paid' or (o.status='pending_payment' and o.expires_at>now())))
    ) order by l.lot_number) from public.event_lots l where l.event_id=e.id),'[]'::jsonb)
  ) from public.events e where e.slug=target_slug and e.status in ('published','sales_open','sales_closed','completed');
$function$;


CREATE OR REPLACE FUNCTION public.sync_event_active_lot(target_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare current_lot public.event_lots%rowtype; next_lot_id uuid; paid_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_event_id::text, 0));
  select * into current_lot from public.event_lots
  where event_id=target_event_id and active order by lot_number limit 1 for update;
  if not found then return; end if;
  select coalesce(sum(coalesce(expo_quantity,quantity)),0)::integer into paid_count
  from public.ticket_orders where lot_id=current_lot.id and status='paid';
  if paid_count < current_lot.capacity then return; end if;
  update public.event_lots set active=false,updated_at=now() where id=current_lot.id;
  select id into next_lot_id from public.event_lots
  where event_id=target_event_id and lot_number>current_lot.lot_number
  order by lot_number limit 1 for update;
  if next_lot_id is not null then
    update public.event_lots set active=true,updated_at=now() where id=next_lot_id;
  else
    update public.events set status='sales_closed',updated_at=now() where id=target_event_id and not carona_sales_enabled;
  end if;
end $function$;


CREATE OR REPLACE FUNCTION public.customer_event_tickets()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,'driver_name',t.driver_name,
    'ticket_kind',t.ticket_kind,'carona_redeemed_at',t.carona_redeemed_at,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,
    'instagram_handle',t.instagram_handle,'qr_token',case when o.status='paid' and t.status in ('active','checked_in') then t.qr_token else null end,
    'order_id',o.id,'order_status',o.status,'payment_status',o.payment_status,
    'total_cents',coalesce(t.face_price_cents,o.unit_price_cents)-round(o.discount_cents::numeric/o.quantity)::integer,'subtotal_cents',coalesce(t.face_price_cents,o.unit_price_cents),
    'discount_cents',round(o.discount_cents::numeric/o.quantity)::integer,'order_total_cents',o.payable_cents,
    'order_quantity',o.quantity,'coupon_code',o.coupon_code,'expires_at',o.expires_at,'created_at',o.created_at,
    'is_test',p.is_test,'event_id',e.id,'event_name',e.name,'event_starts_at',e.starts_at,
    'venue_name',e.venue_name,'age_rating',e.age_rating,'lot_name',l.name,
    'refund_request',case when r.id is null then null else jsonb_build_object('id',r.id,'status',r.status,'reason',r.reason,'details',r.details,'admin_notes',r.admin_notes,'created_at',r.created_at,'updated_at',r.updated_at) end
  ) order by e.starts_at desc,o.created_at desc,t.created_at),'[]'::jsonb)
  from public.ticket_orders o join public.tickets t on t.order_id=o.id join public.profiles p on p.id=o.user_id
  join public.events e on e.id=o.event_id left join public.event_lots l on l.id=o.lot_id
  left join public.ticket_refund_requests r on r.ticket_order_id=o.id
  where o.user_id=auth.uid() and t.owner_user_id=auth.uid();
$function$;


CREATE OR REPLACE FUNCTION public.admin_event_ticket_sales(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not public.is_admin() then raise exception 'Acesso negado.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'ticket_id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,'driver_name',t.driver_name,
   'driver_tax_id',t.driver_tax_id,'driver_phone',t.driver_phone,'ticket_kind',t.ticket_kind,'carona_redeemed_at',t.carona_redeemed_at,'vehicle_plate',t.vehicle_plate,
   'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,'vehicle_year',t.vehicle_year,
   'instagram_handle',t.instagram_handle,'order_id',o.id,'customer_email',o.customer_email,
   'subtotal_cents',coalesce(t.face_price_cents,o.unit_price_cents),'discount_cents',round(o.discount_cents::numeric/o.quantity)::integer,
   'total_cents',coalesce(t.face_price_cents,o.unit_price_cents)-round(o.discount_cents::numeric/o.quantity)::integer,'order_total_cents',o.payable_cents,
   'order_quantity',o.quantity,'coupon_code',o.coupon_code,'payment_method',o.payment_method,
   'paid_at',o.paid_at,'created_at',o.created_at,'photo',case when m.id is null then null else jsonb_build_object('storage_path',m.storage_path,'submission_count',m.submission_count,'status',m.status,'created_at',m.created_at) end
 ) order by o.created_at desc,t.created_at) from public.tickets t join public.ticket_orders o on o.id=t.order_id
 left join public.ticket_media m on m.ticket_id=t.id where t.event_id=p_event_id and o.status='paid'),'[]');
end $function$;


CREATE OR REPLACE FUNCTION public.admin_inspect_event_ticket(p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
declare
  target_ticket public.tickets%rowtype;
  target_event public.events%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito aos administradores.' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_qr_token, ''))) < 16 then
    raise exception 'QR Code incompleto ou inválido.' using errcode = '22023';
  end if;

  select * into target_ticket
  from public.tickets
  where qr_token_hash = encode(digest(convert_to(trim(p_qr_token), 'UTF8'), 'sha256'), 'hex')
  limit 1;

  if not found then
    raise exception 'Ingresso não encontrado. Confira se este QR pertence ao evento.' using errcode = 'P0002';
  end if;

  select * into target_event from public.events where id = target_ticket.event_id;

  return jsonb_build_object(
    'id', target_ticket.id,
    'ticket_kind',target_ticket.ticket_kind,
    'carona_redeemed_at',target_ticket.carona_redeemed_at,
    'ticket_code', target_ticket.ticket_code,
    'status', target_ticket.status,
    'event_id', target_ticket.event_id,
    'event_name', target_event.name,
    'driver_name', target_ticket.driver_name,
    'driver_phone', target_ticket.driver_phone,
    'vehicle_plate', target_ticket.vehicle_plate,
    'vehicle_make', target_ticket.vehicle_make,
    'vehicle_model', target_ticket.vehicle_model,
    'vehicle_year', target_ticket.vehicle_year,
    'vehicle_color', target_ticket.vehicle_color,
    'is_complimentary', target_ticket.is_complimentary,
    'first_checked_in_at', target_ticket.first_checked_in_at,
    'last_entry_at', target_ticket.last_entry_at,
    'last_exit_at', target_ticket.last_exit_at
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.admin_search_event_tickets(p_event_id uuid, p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  search_text text := lower(trim(coalesce(p_query, '')));
  compact_search text := regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9]', '', 'g');
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito aos administradores.' using errcode = '42501';
  end if;

  if p_event_id is null then
    raise exception 'Selecione o evento antes de pesquisar.' using errcode = '22023';
  end if;

  if length(search_text) < 2 then
    raise exception 'Digite ao menos 2 caracteres para pesquisar.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) - 'match_rank' order by item.match_rank, item.driver_name, item.ticket_code), '[]'::jsonb)
  into result
  from (
    select
      case
        when lower(t.ticket_code) = search_text then 0
        when lower(t.vehicle_plate) = search_text or regexp_replace(lower(t.vehicle_plate), '[^a-z0-9]', '', 'g') = compact_search then 1
        when lower(t.driver_name) = search_text then 2
        else 3
      end as match_rank,
      t.id,
      t.ticket_kind,
      t.carona_redeemed_at,
      t.ticket_code,
      t.status,
      t.event_id,
      e.name as event_name,
      t.driver_name,
      t.driver_phone,
      t.vehicle_plate,
      t.vehicle_make,
      t.vehicle_model,
      t.vehicle_year,
      t.is_complimentary,
      t.first_checked_in_at,
      t.last_entry_at,
      t.last_exit_at,
      t.qr_token
    from public.tickets t
    join public.events e on e.id = t.event_id
    where t.event_id = p_event_id
      and (
        t.qr_token = trim(p_query)
        or lower(t.ticket_code) like '%' || search_text || '%'
        or lower(t.driver_name) like '%' || search_text || '%'
        or lower(t.driver_phone) like '%' || search_text || '%'
        or lower(t.vehicle_plate) like '%' || search_text || '%'
        or lower(t.vehicle_make) like '%' || search_text || '%'
        or lower(t.vehicle_model) like '%' || search_text || '%'
        or lower(coalesce(t.instagram_handle, '')) like '%' || search_text || '%'
        or (
          length(compact_search) >= 2
          and (
            regexp_replace(lower(t.ticket_code), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
            or regexp_replace(lower(t.driver_phone), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
            or regexp_replace(lower(t.vehicle_plate), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
            or regexp_replace(lower(t.driver_tax_id), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
          )
        )
      )
    order by match_rank, t.driver_name, t.ticket_code
    limit 20
  ) item;

  return result;
end;
$function$;

ANALYZE public.ticket_orders;

CREATE OR REPLACE FUNCTION public.admin_checkin_event_ticket(p_qr_token text, p_action ticket_checkin_type, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
declare
  target_ticket public.tickets%rowtype;
  gate_timestamp timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito aos administradores.' using errcode = '42501';
  end if;

  select * into target_ticket
  from public.tickets
  where qr_token_hash = encode(digest(convert_to(trim(coalesce(p_qr_token, '')), 'UTF8'), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'Ingresso não encontrado.' using errcode = 'P0002';
  end if;

  if target_ticket.status in ('cancelled', 'refunded', 'blocked') then
    raise exception 'Este ingresso está % e não pode ser utilizado.', target_ticket.status using errcode = 'P0001';
  end if;

  if target_ticket.ticket_kind='carona' then
    raise exception 'Carona Radical não inclui vaga Expo. Use a validação de Carona.';
  end if;
  if target_ticket.status='reserved' or (not target_ticket.is_complimentary and not exists(select 1 from public.ticket_orders where id=target_ticket.order_id and status='paid')) then
    raise exception 'O ingresso precisa estar pago e ativo para entrar.';
  end if;
  if p_action = 'entry' then
    if target_ticket.last_entry_at is not null
       and (target_ticket.last_exit_at is null or target_ticket.last_entry_at > target_ticket.last_exit_at) then
      raise exception 'A entrada deste ingresso já foi registrada.' using errcode = 'P0001';
    end if;
    update public.tickets set
      status = 'checked_in',
      first_checked_in_at = coalesce(first_checked_in_at, gate_timestamp),
      last_entry_at = gate_timestamp,
      updated_at = gate_timestamp
    where id = target_ticket.id;
  elsif p_action = 'reentry' then
    if target_ticket.last_entry_at is null or target_ticket.last_exit_at is null
       or target_ticket.last_exit_at < target_ticket.last_entry_at then
      raise exception 'Registre a saída antes da reentrada.' using errcode = 'P0001';
    end if;
    update public.tickets set
      status = 'checked_in',
      last_entry_at = gate_timestamp,
      updated_at = gate_timestamp
    where id = target_ticket.id;
  elsif p_action = 'exit' then
    if target_ticket.last_entry_at is null
       or (target_ticket.last_exit_at is not null and target_ticket.last_exit_at >= target_ticket.last_entry_at) then
      raise exception 'Não existe uma entrada aberta para registrar a saída.' using errcode = 'P0001';
    end if;
    update public.tickets set last_exit_at = gate_timestamp, updated_at = gate_timestamp
    where id = target_ticket.id;
  elsif p_action = 'undo' then
    if nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception 'Informe o motivo da correção administrativa.' using errcode = '22023';
    end if;
  else
    raise exception 'Ação de portaria inválida.' using errcode = '22023';
  end if;

  insert into public.ticket_checkins(ticket_id, event_id, action, actor_user_id, reason)
  values (target_ticket.id, target_ticket.event_id, p_action, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''));

  return public.admin_inspect_event_ticket(p_qr_token);
end;
$function$;


CREATE OR REPLACE FUNCTION public.enqueue_ticket_photo_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare inserted_count integer:=0;
begin
  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'ticket_photo_reminder','Mostre seu carro no post de confirmados',
    jsonb_build_object('ticket_id',t.id,'ticket_code',t.ticket_code,'driver_name',t.driver_name,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,'event_name',e.name,'event_date',e.starts_at),
    'ticket-photo-reminder:'||t.id
  from public.tickets t
  join public.ticket_orders o on o.id=t.order_id and o.status='paid'
  join public.events e on e.id=t.event_id and e.starts_at>now()
  join public.profiles p on p.id=o.user_id and not coalesce(p.is_test,false)
  left join public.ticket_media tm on tm.ticket_id=t.id
  where t.ticket_kind in ('expo','combo') and tm.id is null and coalesce(o.paid_at,o.created_at)<now()-interval '6 hours'
  on conflict(dedupe_key) do nothing;
  get diagnostics inserted_count=row_count;
  return inserted_count;
end $function$;

CREATE OR REPLACE FUNCTION public.enqueue_only_emails()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare inserted_count integer:=0; n integer;
begin
  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'ticket_purchase','Seu ingresso para o Only Cars Meeting está confirmado',
    jsonb_build_object('order_id',o.id,'event_name',e.name,'event_date',e.starts_at,'driver_name',o.customer_name,
      'total_cents',o.payable_cents,'tickets',jsonb_agg(jsonb_build_object('ticket_kind',t.ticket_kind,'driver_name',t.driver_name,'ticket_code',t.ticket_code,'qr_token',t.qr_token,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model) order by t.created_at)),
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
end $function$;
