-- Owner identity is resolved once from the confirmed account, never from editable metadata.
create schema if not exists only_club_internal;
revoke all on schema only_club_internal from public, anon;
grant usage on schema only_club_internal to authenticated, service_role;
create table only_club_internal.owner_account (
  singleton boolean primary key default true check(singleton),
  user_id uuid not null unique references auth.users(id) on delete restrict
);
alter table only_club_internal.owner_account enable row level security;
insert into only_club_internal.owner_account(user_id)
select id from auth.users where lower(email)='okeven.contato@gmail.com' and email_confirmed_at is not null;
do $$ begin
 if not exists(select 1 from only_club_internal.owner_account) then raise exception 'Conta proprietária confirmada não encontrada.'; end if;
end $$;

create function only_club_internal.is_owner() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from only_club_internal.owner_account where user_id=auth.uid());
$$;
create function public.is_club_owner() returns boolean
language sql stable security invoker set search_path='' as $$ select only_club_internal.is_owner(); $$;

-- A trigger prevents role escalation through direct profile PATCH, including existing grants.
create function only_club_internal.guard_role() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.role is distinct from old.role then
  if (auth.uid() is not null or current_setting('role',true)='authenticated') and not only_club_internal.is_owner() then
   raise exception 'Somente o proprietário pode alterar administradores.' using errcode='42501';
  end if;
  if exists(select 1 from only_club_internal.owner_account where user_id=old.id) then
   raise exception 'O acesso do proprietário não pode ser removido.' using errcode='42501';
  end if;
  insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'club_admin_role_changed','profile',old.id::text,jsonb_build_object('role',old.role),jsonb_build_object('role',new.role));
 end if;
 return new;
end $$;
create trigger only_club_guard_role before update of role on public.profiles for each row execute function only_club_internal.guard_role();

create function only_club_internal.users_list(p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not only_club_internal.is_owner() then raise exception 'Acesso exclusivo do proprietário.' using errcode='42501'; end if;
 select jsonb_build_object('total',count(*),'users',coalesce((select jsonb_agg(to_jsonb(x)) from (
  select u.id,u.email,p.display_name,coalesce(p.role::text,'customer') as role,u.created_at,
    u.id=(select user_id from only_club_internal.owner_account) as is_owner
  from auth.users u left join public.profiles p on p.id=u.id
  where strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(left(coalesce(p_search,''),120)))>0
  order by u.created_at desc,u.id limit 30 offset greatest(0,p_offset)
 ) x),'[]'::jsonb)) into result from auth.users u left join public.profiles p on p.id=u.id
 where strpos(lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')),lower(left(coalesce(p_search,''),120)))>0;
 return result;
end $$;
create function public.owner_list_users(p_search text default '',p_offset integer default 0) returns jsonb
language sql security invoker set search_path='' as $$ select only_club_internal.users_list(p_search,p_offset); $$;
create function only_club_internal.set_admin(p_user_id uuid,p_admin boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not only_club_internal.is_owner() then raise exception 'Acesso exclusivo do proprietário.' using errcode='42501'; end if;
 if p_admin is null then raise exception 'Permissão inválida.'; end if;
 if exists(select 1 from only_club_internal.owner_account where user_id=p_user_id) then raise exception 'A conta proprietária está protegida.'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Usuário não encontrado.'; end if;
 insert into public.profiles(id) values(p_user_id) on conflict(id) do nothing;
 update public.profiles set role=(case when p_admin then 'admin' else 'customer' end)::public.user_role where id=p_user_id;
end $$;
create function public.owner_set_admin(p_user_id uuid,p_admin boolean) returns void
language sql security invoker set search_path='' as $$ select only_club_internal.set_admin(p_user_id,p_admin); $$;

-- Internal view has no browser grants. Attendance is one event per account, regardless of ticket quantity.
create view only_club_internal.attendance with(security_invoker=true) as
 select t.owner_user_id as user_id,t.event_id,e.name,e.starts_at,min(coalesce(t.first_checked_in_at,t.carona_redeemed_at)) as attended_at
 from public.tickets t join public.events e on e.id=t.event_id
 join public.profiles p on p.id=t.owner_user_id
 left join public.ticket_orders o on o.id=t.order_id
 where not p.is_test and e.starts_at<=now()
 and t.status in ('active','checked_in') and (t.is_complimentary or o.status='paid')
 and (t.first_checked_in_at is not null or t.carona_redeemed_at is not null)
 and coalesce((select c.action::text from public.ticket_checkins c where c.ticket_id=t.id order by c.created_at desc,c.id desc limit 1),'entry')<>'undo'
 group by t.owner_user_id,t.event_id,e.name,e.starts_at;
create function only_club_internal.discount_for(p_user_id uuid) returns integer
language sql stable security invoker set search_path='' as $$
 select case when count(*)>=10 then 30 when count(*)>=5 then 20 else 0 end from only_club_internal.attendance where user_id=p_user_id;
$$;
create function only_club_internal.loyalty() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n integer; ev jsonb;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
 select count(*),coalesce(jsonb_agg(jsonb_build_object('id',event_id,'name',name,'starts_at',starts_at,'attended_at',attended_at) order by starts_at desc),'[]'::jsonb)
 into n,ev from only_club_internal.attendance where user_id=auth.uid();
 return jsonb_build_object('events_count',n,'discount_percent',case when n>=10 then 30 when n>=5 then 20 else 0 end,
 'shirts_earned',n/5,'hoodies_earned',n/10,'events',ev);
end $$;
create function public.customer_loyalty() returns jsonb
language sql stable security invoker set search_path='' as $$ select only_club_internal.loyalty(); $$;
create function only_club_internal.ranking() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Ranking restrito aos administradores.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(r)) from (
 select dense_rank() over(order by count(*) desc) as position,a.user_id,p.display_name,count(*) as events_count,
 case when count(*)>=10 then 30 when count(*)>=5 then 20 else 0 end as discount_percent
 from only_club_internal.attendance a join public.profiles p on p.id=a.user_id
 group by a.user_id,p.display_name order by count(*) desc,p.display_name,a.user_id limit 200
 ) r),'[]'::jsonb);
end $$;
create function public.admin_loyalty_ranking() returns jsonb
language sql stable security invoker set search_path='' as $$ select only_club_internal.ranking(); $$;

revoke all on all tables in schema only_club_internal from public,anon,authenticated;
revoke all on all functions in schema only_club_internal from public,anon,authenticated;
grant execute on function only_club_internal.is_owner(),only_club_internal.users_list(text,integer),only_club_internal.set_admin(uuid,boolean),only_club_internal.loyalty(),only_club_internal.ranking() to authenticated;
grant select on only_club_internal.attendance to service_role;
grant execute on function only_club_internal.discount_for(uuid) to service_role;
revoke all on function public.is_club_owner(),public.owner_list_users(text,integer),public.owner_set_admin(uuid,boolean),public.customer_loyalty(),public.admin_loyalty_ranking() from public,anon;
grant execute on function public.is_club_owner(),public.owner_list_users(text,integer),public.owner_set_admin(uuid,boolean),public.customer_loyalty(),public.admin_loyalty_ranking() to authenticated;
create index if not exists ticket_checkins_loyalty_latest_idx on public.ticket_checkins(ticket_id,created_at desc,id desc);

CREATE OR REPLACE FUNCTION public.service_reserve_typed_tickets(p_user_id uuid, p_event_slug text, p_lot_id uuid, p_buyer jsonb, p_tickets jsonb, p_coupon_code text DEFAULT NULL::text, p_expected_subtotal integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare e public.events%rowtype; l public.event_lots%rowtype; item jsonb; kind text; qty integer; expo_qty integer:=0; ride_qty integer:=0; subtotal integer:=0; price integer; occupied integer; event_occupied integer; order_id uuid; token text; plate text; coupon jsonb; item_prices integer[]:='{}'; i integer:=0; payable integer; loyalty_percent integer; loyalty_discount integer;
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
 loyalty_percent:=only_club_internal.discount_for(p_user_id);
 loyalty_discount:=round(subtotal*loyalty_percent/100.0)::integer;
 if loyalty_discount>0 and loyalty_discount>=subtotal-payable then
  update public.ticket_orders set discount_cents=loyalty_discount,coupon_id=null,coupon_code=null,
    metadata=metadata||jsonb_build_object('loyalty_discount_percent',loyalty_percent,'loyalty_discount_cents',loyalty_discount)
  where id=order_id;
  payable:=subtotal-loyalty_discount;coupon:=null;
 end if;
 for item in select value from jsonb_array_elements(p_tickets) loop
  i:=i+1;kind:=coalesce(item->>'ticket_kind','expo');token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.tickets(order_id,event_id,owner_user_id,qr_token,qr_token_hash,status,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,instagram_handle,ticket_kind,face_price_cents)
  values(order_id,e.id,p_user_id,token,encode(extensions.digest(convert_to(token,'UTF8'),'sha256'),'hex'),'reserved',left(item->>'driver_name',120),item->>'driver_tax_id',item->>'driver_phone',case when kind='carona' then '' else upper(regexp_replace(item->>'vehicle_plate','[^A-Za-z0-9]','','g')) end,case when kind='carona' then '' else left(item->>'vehicle_make',60) end,case when kind='carona' then '' else left(item->>'vehicle_model',80) end,nullif(left(item->>'instagram_handle',40),''),kind,item_prices[i]);
 end loop;
 return jsonb_build_object('order_id',order_id,'total_cents',payable,'subtotal_cents',subtotal,'coupon_code',coupon->>'code','ticket_count',qty,'event_name',e.name,'loyalty_discount_percent',case when coupon is null then loyalty_percent else 0 end);
end $function$
