-- Busca alternativa da portaria quando a leitura do QR Code não estiver disponível.
-- O retorno inclui o token somente para permitir que o fluxo administrativo existente
-- registre a movimentação após a equipe escolher e conferir o ingresso correto.

create or replace function public.admin_search_event_tickets(
  p_event_id uuid,
  p_query text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.admin_search_event_tickets(uuid, text) from public;
revoke all on function public.admin_search_event_tickets(uuid, text) from anon;
grant execute on function public.admin_search_event_tickets(uuid, text) to authenticated;

comment on function public.admin_search_event_tickets(uuid, text) is
  'Busca ingressos do evento por dados operacionais; acesso exclusivo para administradores.';
