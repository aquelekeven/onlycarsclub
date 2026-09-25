-- Isolated coupon management for each event. Archived rows retain paid orders, revenue and coupon history.
ALTER TABLE public.ticket_purchase_coupons ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS ticket_purchase_coupons_archived_idx ON public.ticket_purchase_coupons(event_id, archived_at);

CREATE OR REPLACE FUNCTION public.admin_ticket_purchase_coupons_v2(p_event_id uuid)
RETURNS TABLE (
 id uuid, code text, description text, discount_type text, discount_value integer,
 max_redemptions integer, max_redemptions_per_user integer, starts_at timestamptz, ends_at timestamptz,
 active boolean, reserved_uses bigint, paid_uses bigint, paid_tickets bigint,
 discount_granted_cents bigint, revenue_cents bigint, created_at timestamptz,
 updated_at timestamptz, archived_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $coupon_dashboard$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.' USING errcode = '42501'; END IF;
 RETURN QUERY
 SELECT c.id,c.code,c.description,c.discount_type,c.discount_value,c.max_redemptions,
        c.max_redemptions_per_user,c.starts_at,c.ends_at,c.active,
        COUNT(o.id) FILTER (WHERE o.status='pending_payment' AND o.expires_at>now()),
        COUNT(o.id) FILTER (WHERE o.status='paid'),
        COALESCE(SUM(o.quantity) FILTER (WHERE o.status='paid'),0)::bigint,
        COALESCE(SUM(o.discount_cents) FILTER (WHERE o.status='paid'),0)::bigint,
        COALESCE(SUM(o.payable_cents) FILTER (WHERE o.status='paid'),0)::bigint,
        c.created_at,c.updated_at,c.archived_at
 FROM public.ticket_purchase_coupons c
 LEFT JOIN public.ticket_orders o ON o.coupon_id=c.id
 WHERE c.event_id=p_event_id
 GROUP BY c.id
 ORDER BY c.created_at DESC;
END;
$coupon_dashboard$;

-- "Exclude" is a reversible archive; historical orders must remain linked to the original coupon.
CREATE OR REPLACE FUNCTION public.admin_archive_ticket_purchase_coupon(p_event_id uuid, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $archive_coupon$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.' USING errcode = '42501'; END IF;
 UPDATE public.ticket_purchase_coupons
 SET archived_at=now(), active=false
 WHERE id=p_id AND event_id=p_event_id AND archived_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cupom não encontrado ou já excluído.'; END IF;
 RETURN true;
END;
$archive_coupon$;

CREATE OR REPLACE FUNCTION public.admin_restore_ticket_purchase_coupon(p_event_id uuid, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $restore_coupon$
BEGIN
 IF NOT public.is_admin() THEN RAISE EXCEPTION 'Acesso negado.' USING errcode = '42501'; END IF;
 UPDATE public.ticket_purchase_coupons
 SET archived_at=null, active=false
 WHERE id=p_id AND event_id=p_event_id AND archived_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cupom excluído não encontrado.'; END IF;
 RETURN true;
END;
$restore_coupon$;

-- Existing admin actions must not mutate archived coupons without explicit restoration.
CREATE OR REPLACE FUNCTION public.admin_save_ticket_purchase_coupon(p_event_id uuid, p_id uuid, p_code text, p_description text, p_discount_type text, p_discount_value integer, p_max_redemptions integer, p_max_redemptions_per_user integer, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_active boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where id=p_id and event_id=p_event_id and archived_at is null returning id into saved_id;
    if saved_id is null then raise exception 'Cupom não encontrado.'; end if;
  end if;
  return saved_id;
end;
$function$

CREATE OR REPLACE FUNCTION public.admin_toggle_ticket_purchase_coupon(p_id uuid, p_active boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_admin() then raise exception 'Acesso negado.'; end if;
  update public.ticket_purchase_coupons set active=p_active where id=p_id and archived_at is null;
  if not found then raise exception 'Cupom não encontrado.'; end if;
  return p_active;
end;
$function$

-- All newly created event coupons work for Expo, Carona and combo; payment amount remains server-calculated.
CREATE OR REPLACE FUNCTION public.service_reserve_typed_tickets(p_user_id uuid, p_event_slug text, p_lot_id uuid, p_buyer jsonb, p_tickets jsonb, p_coupon_code text DEFAULT NULL::text, p_expected_subtotal integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
 for item in select value from jsonb_array_elements(p_tickets) loop
  i:=i+1;kind:=coalesce(item->>'ticket_kind','expo');token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.tickets(order_id,event_id,owner_user_id,qr_token,qr_token_hash,status,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,instagram_handle,ticket_kind,face_price_cents)
  values(order_id,e.id,p_user_id,token,encode(extensions.digest(convert_to(token,'UTF8'),'sha256'),'hex'),'reserved',left(item->>'driver_name',120),item->>'driver_tax_id',item->>'driver_phone',case when kind='carona' then '' else upper(regexp_replace(item->>'vehicle_plate','[^A-Za-z0-9]','','g')) end,case when kind='carona' then '' else left(item->>'vehicle_make',60) end,case when kind='carona' then '' else left(item->>'vehicle_model',80) end,nullif(left(item->>'instagram_handle',40),''),kind,item_prices[i]);
 end loop;
 return jsonb_build_object('order_id',order_id,'total_cents',payable,'subtotal_cents',subtotal,'coupon_code',coupon->>'code','ticket_count',qty,'event_name',e.name);
end $function$

REVOKE ALL ON FUNCTION public.admin_ticket_purchase_coupons_v2(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_archive_ticket_purchase_coupon(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.admin_restore_ticket_purchase_coupon(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ticket_purchase_coupons_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_archive_ticket_purchase_coupon(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_ticket_purchase_coupon(uuid,uuid) TO authenticated;
