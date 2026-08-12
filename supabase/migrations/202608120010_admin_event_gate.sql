-- Only Cars Club — operação segura da portaria e leitor de QR Code.
-- O token bruto nunca é armazenado; somente seu SHA-256 é comparado.

create or replace function public.admin_inspect_event_ticket(p_qr_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.admin_checkin_event_ticket(
  p_qr_token text,
  p_action public.ticket_checkin_type,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_ticket public.tickets%rowtype;
  current_time timestamptz := now();
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

  if p_action = 'entry' then
    if target_ticket.last_entry_at is not null
       and (target_ticket.last_exit_at is null or target_ticket.last_entry_at > target_ticket.last_exit_at) then
      raise exception 'A entrada deste ingresso já foi registrada.' using errcode = 'P0001';
    end if;
    update public.tickets set
      status = 'checked_in',
      first_checked_in_at = coalesce(first_checked_in_at, current_time),
      last_entry_at = current_time,
      updated_at = current_time
    where id = target_ticket.id;
  elsif p_action = 'reentry' then
    if target_ticket.last_entry_at is null or target_ticket.last_exit_at is null
       or target_ticket.last_exit_at < target_ticket.last_entry_at then
      raise exception 'Registre a saída antes da reentrada.' using errcode = 'P0001';
    end if;
    update public.tickets set
      status = 'checked_in',
      last_entry_at = current_time,
      updated_at = current_time
    where id = target_ticket.id;
  elsif p_action = 'exit' then
    if target_ticket.last_entry_at is null
       or (target_ticket.last_exit_at is not null and target_ticket.last_exit_at >= target_ticket.last_entry_at) then
      raise exception 'Não existe uma entrada aberta para registrar a saída.' using errcode = 'P0001';
    end if;
    update public.tickets set last_exit_at = current_time, updated_at = current_time
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
$$;

create or replace function public.admin_event_gate_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito aos administradores.' using errcode = '42501';
  end if;

  select id into target_event_id
  from public.events
  where slug = 'only-cars-meeting-2026'
  limit 1;

  return jsonb_build_object(
    'active_tickets', (
      select count(*) from public.tickets
      where event_id = target_event_id and status in ('reserved', 'active', 'checked_in')
    ),
    'inside_event', (
      select count(*) from public.tickets
      where event_id = target_event_id
        and status = 'checked_in'
        and last_entry_at is not null
        and (last_exit_at is null or last_entry_at > last_exit_at)
    ),
    'movements_today', (
      select count(*) from public.ticket_checkins
      where event_id = target_event_id
        and (created_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
    ),
    'recent_activity', coalesce((
      select jsonb_agg(activity order by activity.created_at desc)
      from (
        select
          c.created_at,
          c.action,
          case c.action when 'entry' then 'Entrada' when 'exit' then 'Saída' when 'reentry' then 'Reentrada' else 'Correção' end as action_label,
          t.ticket_code,
          t.driver_name,
          t.vehicle_plate
        from public.ticket_checkins c
        join public.tickets t on t.id = c.ticket_id
        where c.event_id = target_event_id
        order by c.created_at desc
        limit 12
      ) activity
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_inspect_event_ticket(text) from public;
revoke all on function public.admin_checkin_event_ticket(text, public.ticket_checkin_type, text) from public;
revoke all on function public.admin_event_gate_summary() from public;
grant execute on function public.admin_inspect_event_ticket(text) to authenticated;
grant execute on function public.admin_checkin_event_ticket(text, public.ticket_checkin_type, text) to authenticated;
grant execute on function public.admin_event_gate_summary() to authenticated;

comment on function public.admin_inspect_event_ticket(text) is
  'Consulta segura de ingresso por token opaco para administradores da portaria.';
comment on function public.admin_checkin_event_ticket(text, public.ticket_checkin_type, text) is
  'Registra entrada, saída ou reentrada com trava de concorrência e trilha de auditoria.';
