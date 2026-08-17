-- Only Cars Club — elegibilidade de compra, classificação etária e solicitações de reembolso.
alter table public.profiles add column if not exists birth_date date;
comment on column public.profiles.birth_date is 'Data de nascimento usada para validar a idade mínima de compra. Não é pública.';
grant update (display_name, phone, tax_id, birth_date) on table public.profiles to authenticated;

alter table public.events add column if not exists age_rating text not null default 'Livre';
comment on column public.events.age_rating is 'Classificação indicativa exibida na página do evento.';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  supplied_birth_date date;
begin
  begin
    supplied_birth_date := nullif(new.raw_user_meta_data ->> 'birth_date', '')::date;
  exception when others then
    supplied_birth_date := null;
  end;

  insert into public.profiles (id, display_name, birth_date)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'name'), ''), supplied_birth_date);
  return new;
end;
$$;

create table if not exists public.ticket_refund_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_order_id uuid not null unique references public.ticket_orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'requested',
  admin_notes text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ticket_refund_reason_length check (char_length(reason) between 3 and 80),
  constraint ticket_refund_details_length check (details is null or char_length(details) <= 800),
  constraint ticket_refund_status_valid check (status in ('requested','under_review','approved','rejected','refunded','cancelled'))
);

create index if not exists ticket_refund_requests_status_created_idx
  on public.ticket_refund_requests(status, created_at desc);

alter table public.ticket_refund_requests enable row level security;
revoke all on table public.ticket_refund_requests from anon, authenticated;
grant select on table public.ticket_refund_requests to authenticated;

create policy "ticket_refund_select_own_or_admin" on public.ticket_refund_requests
for select using (user_id = auth.uid() or public.is_admin());

create or replace function public.customer_request_ticket_refund(
  p_order_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := auth.uid();
  target_order public.ticket_orders;
  saved public.ticket_refund_requests;
begin
  if current_user_id is null then
    raise exception 'Faça login para solicitar o cancelamento.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Selecione o motivo da solicitação.' using errcode = '22023';
  end if;

  select * into target_order from public.ticket_orders
  where id = p_order_id and user_id = current_user_id for update;
  if not found then raise exception 'Ingresso não encontrado.' using errcode = 'P0002'; end if;
  if target_order.status <> 'paid' then
    raise exception 'A solicitação de reembolso está disponível somente para ingressos pagos.' using errcode = 'P0001';
  end if;

  insert into public.ticket_refund_requests(ticket_order_id, user_id, reason, details)
  values (p_order_id, current_user_id, trim(p_reason), nullif(trim(coalesce(p_details, '')), ''))
  on conflict (ticket_order_id) do update set
    reason = excluded.reason,
    details = excluded.details,
    status = case when public.ticket_refund_requests.status in ('rejected','cancelled') then 'requested' else public.ticket_refund_requests.status end,
    updated_at = now()
  returning * into saved;

  return jsonb_build_object('id', saved.id, 'status', saved.status, 'created_at', saved.created_at);
end;
$$;

create or replace function public.admin_ticket_refund_requests(p_event_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when public.is_admin() then coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'status',r.status,'reason',r.reason,'details',r.details,'admin_notes',r.admin_notes,
    'created_at',r.created_at,'updated_at',r.updated_at,'ticket_order_id',o.id,
    'ticket_code',t.ticket_code,'driver_name',t.driver_name,'vehicle_plate',t.vehicle_plate,
    'customer_email',o.customer_email,'total_cents',o.total_cents
  ) order by r.created_at desc),'[]'::jsonb) else '[]'::jsonb end
  from public.ticket_refund_requests r
  join public.ticket_orders o on o.id = r.ticket_order_id
  join public.tickets t on t.order_id = o.id
  where o.event_id = p_event_id;
$$;

create or replace function public.admin_update_ticket_refund_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.ticket_refund_requests;
begin
  if not public.is_admin() then raise exception 'Acesso restrito a administradores.' using errcode='42501'; end if;
  if p_status not in ('requested','under_review','approved','rejected','refunded','cancelled') then
    raise exception 'Status inválido.' using errcode='22023';
  end if;
  update public.ticket_refund_requests set
    status=p_status, admin_notes=nullif(trim(coalesce(p_admin_notes,'')),''),
    reviewed_by=auth.uid(), reviewed_at=now(), updated_at=now()
  where id=p_request_id returning * into saved;
  if not found then raise exception 'Solicitação não encontrada.' using errcode='P0002'; end if;
  return jsonb_build_object('id',saved.id,'status',saved.status,'updated_at',saved.updated_at);
end;
$$;

revoke all on function public.customer_request_ticket_refund(uuid,text,text) from public;
revoke all on function public.admin_ticket_refund_requests(uuid) from public;
revoke all on function public.admin_update_ticket_refund_request(uuid,text,text) from public;
grant execute on function public.customer_request_ticket_refund(uuid,text,text) to authenticated;
grant execute on function public.admin_ticket_refund_requests(uuid) to authenticated;
grant execute on function public.admin_update_ticket_refund_request(uuid,text,text) to authenticated;

create or replace function public.customer_event_tickets()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,
    'driver_name',t.driver_name,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,
    'vehicle_model',t.vehicle_model,'instagram_handle',t.instagram_handle,
    'qr_token',case when o.status='paid' and t.status in ('active','checked_in') then t.qr_token else null end,
    'order_id',o.id,'order_status',o.status,'payment_status',o.payment_status,
    'total_cents',o.total_cents,'expires_at',o.expires_at,'created_at',o.created_at,
    'is_test',p.is_test,'event_id',e.id,'event_name',e.name,'event_starts_at',e.starts_at,
    'venue_name',e.venue_name,'age_rating',e.age_rating,'lot_name',l.name,
    'refund_request',case when r.id is null then null else jsonb_build_object(
      'id',r.id,'status',r.status,'reason',r.reason,'details',r.details,
      'admin_notes',r.admin_notes,'created_at',r.created_at,'updated_at',r.updated_at
    ) end
  ) order by e.starts_at desc,o.created_at desc),'[]'::jsonb)
  from public.ticket_orders o join public.tickets t on t.order_id=o.id
  join public.profiles p on p.id=o.user_id join public.events e on e.id=o.event_id
  join public.event_lots l on l.id=o.lot_id
  left join public.ticket_refund_requests r on r.ticket_order_id=o.id
  where o.user_id=auth.uid() and t.owner_user_id=auth.uid();
$$;
revoke all on function public.customer_event_tickets() from public;
grant execute on function public.customer_event_tickets() to authenticated;

update public.events set age_rating='Livre' where slug='only-cars-meeting-2026';
