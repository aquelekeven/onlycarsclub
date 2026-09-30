CREATE OR REPLACE FUNCTION public.admin_checkin_event_ticket(p_qr_token text, p_action ticket_checkin_type, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
declare
  target_ticket public.tickets%rowtype;
  gate_timestamp timestamptz;
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

  gate_timestamp := clock_timestamp();

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
    raise exception 'Use a confirmação de desfazer entrada para corrigir este ingresso.';
  else
    raise exception 'Ação de portaria inválida.' using errcode = '22023';
  end if;

  insert into public.ticket_checkins(ticket_id, event_id, action, actor_user_id, reason, metadata, created_at)
  values (target_ticket.id, target_ticket.event_id, p_action, auth.uid(), nullif(trim(coalesce(p_reason, '')), ''), jsonb_build_object('previous_status',target_ticket.status,'previous_first',target_ticket.first_checked_in_at,'previous_entry',target_ticket.last_entry_at,'previous_exit',target_ticket.last_exit_at), gate_timestamp);

  return public.admin_inspect_event_ticket(p_qr_token);
end;
$function$;


-- Cancel only the exact open entry shown to the operator. Preserve the audit log.
create or replace function public.admin_undo_event_entry(p_qr_token text, p_expected_entry_at timestamptz, p_reason text)
returns jsonb language plpgsql security definer set search_path='pg_catalog','extensions' as $$
declare t public.tickets%rowtype; c public.ticket_checkins%rowtype;
 previous_entry timestamptz; previous_first timestamptz; previous_exit timestamptz;
begin
 if not public.can_access_gate() then raise exception 'Acesso restrito à equipe da portaria.' using errcode='42501'; end if;
 if length(btrim(coalesce(p_reason,'')))<3 then raise exception 'Informe o motivo da correção.'; end if;
 select * into t from public.tickets where qr_token_hash=encode(digest(convert_to(btrim(coalesce(p_qr_token,'')),'UTF8'),'sha256'),'hex') for update;
 if not found then raise exception 'Ingresso não encontrado.'; end if;
 if t.status<>'checked_in' or t.last_entry_at is null or t.last_entry_at is distinct from p_expected_entry_at
    or (t.last_exit_at is not null and t.last_exit_at>=t.last_entry_at) then
   raise exception 'A entrada mudou ou já foi desfeita. Consulte o ingresso novamente.';
 end if;
 select * into c from public.ticket_checkins where ticket_id=t.id and action in ('entry','reentry')
   and not (metadata ? 'reversed_at') order by created_at desc,id desc limit 1;
 if not found or c.created_at<>t.last_entry_at then raise exception 'Não foi possível identificar a entrada. Peça ajuda a um administrador.'; end if;
 if c.metadata ? 'previous_status' then
   previous_entry := (c.metadata->>'previous_entry')::timestamptz;
   previous_first := (c.metadata->>'previous_first')::timestamptz;
   previous_exit := (c.metadata->>'previous_exit')::timestamptz;
 else
   select min(created_at),max(created_at) into previous_first,previous_entry from public.ticket_checkins
    where ticket_id=t.id and id<>c.id and created_at<=c.created_at and action in ('entry','reentry') and not(metadata ? 'reversed_at');
   select max(created_at) into previous_exit from public.ticket_checkins where ticket_id=t.id and created_at<c.created_at and action='exit';
 end if;
 update public.ticket_checkins set metadata=metadata||jsonb_build_object('reversed_at',clock_timestamp(),'reversed_by',auth.uid()) where id=c.id;
 update public.tickets set status=case when previous_entry is null then 'active'::public.ticket_status else 'checked_in'::public.ticket_status end,
   first_checked_in_at=previous_first,last_entry_at=previous_entry,last_exit_at=previous_exit,updated_at=clock_timestamp() where id=t.id;
 insert into public.ticket_checkins(ticket_id,event_id,action,actor_user_id,reason,metadata,created_at)
 values(t.id,t.event_id,'undo',auth.uid(),left(btrim(p_reason),500),jsonb_build_object('reversed_checkin_id',c.id),clock_timestamp());
 return public.admin_inspect_event_ticket(p_qr_token);
end $$;
revoke all on function public.admin_undo_event_entry(text,timestamptz,text) from public,anon;
grant execute on function public.admin_undo_event_entry(text,timestamptz,text) to authenticated;

create or replace function public.admin_event_gate_summary_for_event(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.can_access_gate() then raise exception 'Acesso restrito à equipe da portaria.' using errcode='42501'; end if;
 if not exists(select 1 from public.events where id=p_event_id) then raise exception 'Evento não encontrado.'; end if;
 return jsonb_build_object(
 'active_tickets',(select count(*) from public.tickets where event_id=p_event_id and status in ('active','checked_in')),
 'inside_event',(select count(*) from public.tickets where event_id=p_event_id and status='checked_in' and last_entry_at is not null and (last_exit_at is null or last_entry_at>last_exit_at)),
 'movements_today',(select count(*) from public.ticket_checkins where event_id=p_event_id and (created_at at time zone 'America/Sao_Paulo')::date=(now() at time zone 'America/Sao_Paulo')::date),
 'recent_activity',coalesce((select jsonb_agg(a order by a.created_at desc) from (
 select c.created_at,c.action::text,
 case when c.metadata ? 'reversed_at' then 'Entrada desfeita' else case c.action when 'entry' then 'Entrada confirmada' when 'reentry' then 'Reentrada confirmada' when 'exit' then 'Saída registrada' else 'Entrada desfeita' end end as action_label,
 t.ticket_code,t.driver_name,t.vehicle_plate
 from public.ticket_checkins c join public.tickets t on t.id=c.ticket_id where c.event_id=p_event_id
 union all
 select t.carona_redeemed_at,'carona','Carona utilizada',t.ticket_code,t.driver_name,t.vehicle_plate from public.tickets t where t.event_id=p_event_id and t.carona_redeemed_at is not null
 order by created_at desc limit 50
 ) a),'[]'::jsonb));
end $$;
revoke all on function public.admin_event_gate_summary_for_event(uuid) from public,anon;
grant execute on function public.admin_event_gate_summary_for_event(uuid) to authenticated;
