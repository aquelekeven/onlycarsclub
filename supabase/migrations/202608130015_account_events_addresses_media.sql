-- Only Cars Club — endereços isolados, eventos da conta e fotos de confirmação.

-- O cliente pode editar seus dados comuns, mas nunca promover a própria conta.
revoke update on table public.profiles from authenticated;
grant update (display_name, phone, tax_id) on table public.profiles to authenticated;

-- Defesa adicional: cada cliente gerencia somente seus próprios endereços.
drop policy if exists "addresses_manage_own_or_admin" on public.addresses;
create policy "addresses_select_own" on public.addresses
for select to authenticated using (user_id = auth.uid());
create policy "addresses_insert_own" on public.addresses
for insert to authenticated with check (user_id = auth.uid());
create policy "addresses_update_own" on public.addresses
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "addresses_delete_own" on public.addresses
for delete to authenticated using (user_id = auth.uid());

-- Bucket privado: a foto só é enviada pelo dono e lida pela equipe autorizada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-confirmations', 'ticket-confirmations', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ticket_confirmation_owner_insert" on storage.objects;
create policy "ticket_confirmation_owner_insert" on storage.objects
for insert to authenticated with check (
  bucket_id = 'ticket-confirmations'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "ticket_confirmation_owner_update" on storage.objects;
create policy "ticket_confirmation_owner_update" on storage.objects
for update to authenticated using (
  bucket_id = 'ticket-confirmations'
  and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'ticket-confirmations'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "ticket_confirmation_owner_select" on storage.objects;
create policy "ticket_confirmation_owner_select" on storage.objects
for select to authenticated using (
  bucket_id = 'ticket-confirmations'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- Inclui o id do evento para a interface agrupar ingressos sem misturar edições.
create or replace function public.customer_event_tickets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'ticket_code', t.ticket_code,
    'ticket_status', t.status,
    'driver_name', t.driver_name,
    'vehicle_plate', t.vehicle_plate,
    'vehicle_make', t.vehicle_make,
    'vehicle_model', t.vehicle_model,
    'instagram_handle', t.instagram_handle,
    'qr_token', case when o.status = 'paid' and t.status in ('active','checked_in') then t.qr_token else null end,
    'order_id', o.id,
    'order_status', o.status,
    'payment_status', o.payment_status,
    'total_cents', o.total_cents,
    'created_at', o.created_at,
    'event_id', e.id,
    'event_name', e.name,
    'event_starts_at', e.starts_at,
    'venue_name', e.venue_name,
    'lot_name', l.name
  ) order by e.starts_at desc, o.created_at desc), '[]'::jsonb)
  from public.ticket_orders o
  join public.tickets t on t.order_id = o.id
  join public.events e on e.id = o.event_id
  join public.event_lots l on l.id = o.lot_id
  where o.user_id = auth.uid()
    and t.owner_user_id = auth.uid();
$$;

revoke all on function public.customer_event_tickets() from public;
grant execute on function public.customer_event_tickets() to authenticated;

create or replace function public.admin_event_gate_events()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'starts_at', e.starts_at,
    'venue_name', e.venue_name,
    'status', e.status,
    'ticket_count', (select count(*) from public.tickets t where t.event_id = e.id)
  ) order by e.starts_at desc), '[]'::jsonb) else '[]'::jsonb end
  from public.events e;
$$;

revoke all on function public.admin_event_gate_events() from public;
grant execute on function public.admin_event_gate_events() to authenticated;

create or replace function public.admin_event_gate_summary_for_event(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito aos administradores.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Evento não encontrado.' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'active_tickets', (select count(*) from public.tickets where event_id = p_event_id and status in ('reserved','active','checked_in')),
    'inside_event', (select count(*) from public.tickets where event_id = p_event_id and status = 'checked_in' and last_entry_at is not null and (last_exit_at is null or last_entry_at > last_exit_at)),
    'movements_today', (select count(*) from public.ticket_checkins where event_id = p_event_id and (created_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date),
    'recent_activity', coalesce((select jsonb_agg(activity order by activity.created_at desc) from (
      select c.created_at, c.action,
        case c.action when 'entry' then 'Entrada' when 'exit' then 'Saída' when 'reentry' then 'Reentrada' else 'Correção' end as action_label,
        t.ticket_code, t.driver_name, t.vehicle_plate
      from public.ticket_checkins c join public.tickets t on t.id = c.ticket_id
      where c.event_id = p_event_id order by c.created_at desc limit 12
    ) activity), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_event_gate_summary_for_event(uuid) from public;
grant execute on function public.admin_event_gate_summary_for_event(uuid) to authenticated;
