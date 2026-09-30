-- Portaria is separate from admin; existing administrative RLS is unchanged.
create or replace function only_club_internal.can_access_gate() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid() and role::text in ('admin','gate'));
$$;
create or replace function public.can_access_gate() returns boolean
language sql stable security invoker set search_path='' as $$ select only_club_internal.can_access_gate(); $$;
create or replace function only_club_internal.set_user_role(p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not only_club_internal.is_owner() then raise exception 'Acesso exclusivo do proprietário.' using errcode='42501'; end if;
 if p_role is null or p_role not in ('customer','gate','admin') then raise exception 'Cargo inválido.' using errcode='22023'; end if;
 if exists(select 1 from only_club_internal.owner_account where user_id=p_user_id) then raise exception 'A conta proprietária está protegida.' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and deleted_at is null) then raise exception 'Usuário não encontrado.'; end if;
 insert into public.profiles(id) values(p_user_id) on conflict(id) do nothing;
 update public.profiles set role=p_role::public.user_role where id=p_user_id;
end $$;
create or replace function public.owner_set_user_role(p_user_id uuid,p_role text) returns void
language sql security invoker set search_path='' as $$ select only_club_internal.set_user_role(p_user_id,p_role); $$;
revoke all on function only_club_internal.can_access_gate(),public.can_access_gate(),only_club_internal.set_user_role(uuid,text),public.owner_set_user_role(uuid,text) from public,anon;
grant execute on function only_club_internal.can_access_gate(),public.can_access_gate(),only_club_internal.set_user_role(uuid,text),public.owner_set_user_role(uuid,text) to authenticated;

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
  if not public.can_access_gate() then
    raise exception 'Acesso restrito à equipe da portaria.' using errcode = '42501';
  end if;

  if p_action = 'undo' and not public.is_admin() then
    raise exception 'Correções são exclusivas dos administradores.' using errcode='42501';
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

CREATE OR REPLACE FUNCTION public.admin_event_gate_events()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when public.can_access_gate() then coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'starts_at', e.starts_at,
    'venue_name', e.venue_name,
    'status', e.status,
    'ticket_count', (select count(*) from public.tickets t where t.event_id = e.id)
  ) order by e.starts_at desc), '[]'::jsonb) else '[]'::jsonb end
  from public.events e;
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
  if not public.can_access_gate() then
    raise exception 'Acesso restrito à equipe da portaria.' using errcode = '42501';
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

CREATE OR REPLACE FUNCTION only_ticket_internal.redeem_carona(p_qr_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tickets%rowtype;
begin
  if auth.uid() is null or not public.can_access_gate() then
    raise exception 'Acesso restrito à equipe da portaria.' using errcode='42501';
  end if;
  select * into t from public.tickets
  where qr_token_hash=encode(extensions.digest(convert_to(btrim(p_qr_token),'UTF8'),'sha256'),'hex')
  for update;
  if not found or t.ticket_kind not in ('carona','combo') then raise exception 'Este ingresso não inclui Carona Radical.'; end if;
  if t.carona_redeemed_at is not null then raise exception 'Esta Carona já foi utilizada.'; end if;
  if t.status not in ('active','checked_in')
    or (not t.is_complimentary and not exists(
      select 1 from public.ticket_orders where id=t.order_id and status='paid'
    )) then raise exception 'A Carona exige um ingresso ativo.'; end if;
  update public.tickets set carona_redeemed_at=now(),carona_redeemed_by=auth.uid() where id=t.id;
  return public.admin_inspect_event_ticket(p_qr_token);
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
  if not public.can_access_gate() then
    raise exception 'Acesso restrito à equipe da portaria.' using errcode = '42501';
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

CREATE OR REPLACE FUNCTION only_club_internal.user_directory(p_search text DEFAULT ''::text, p_offset integer DEFAULT 0, p_sort text DEFAULT 'newest'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   'admins',coalesce(jsonb_agg(to_jsonb(o)-'position' order by position) filter(where role in ('admin','gate')),'[]'::jsonb)) from ordered o
 );
end $function$;

revoke all on function public.admin_event_gate_events(),public.admin_search_event_tickets(uuid,text),public.admin_inspect_event_ticket(text),public.admin_checkin_event_ticket(text,public.ticket_checkin_type,text),public.admin_redeem_carona(text),only_ticket_internal.redeem_carona(text) from public,anon;
grant execute on function public.admin_event_gate_events(),public.admin_search_event_tickets(uuid,text),public.admin_inspect_event_ticket(text),public.admin_checkin_event_ticket(text,public.ticket_checkin_type,text),public.admin_redeem_carona(text),only_ticket_internal.redeem_carona(text) to authenticated;

