-- Only Cars Club — central privada de trocas, devoluções e arrependimento.

create table public.order_exchange_requests (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('size_exchange','color_exchange','defect','wrong_item','withdrawal','other')),
  requested_solution text not null check (requested_solution in ('exchange','refund','support')),
  status text not null default 'received' check (status in ('received','under_review','awaiting_return','return_in_transit','received_return','exchange_sent','refunded','rejected','cancelled','completed')),
  items jsonb not null check (jsonb_typeof(items)='array' and jsonb_array_length(items)>0),
  details text not null check (char_length(details) between 5 and 1500),
  photo_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(photo_paths)='array' and jsonb_array_length(photo_paths)<=3),
  customer_message text,
  admin_notes text,
  return_tracking_code text,
  return_tracking_url text,
  replacement_tracking_code text,
  replacement_tracking_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index order_exchange_one_active
on public.order_exchange_requests(order_id)
where status not in ('rejected','cancelled','completed','refunded');

create trigger order_exchange_requests_set_updated_at before update on public.order_exchange_requests
for each row execute function public.set_updated_at();

alter table public.order_exchange_requests enable row level security;
create policy "exchange_select_own_or_admin" on public.order_exchange_requests for select to authenticated
using (user_id=auth.uid() or public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('exchange-evidence','exchange-evidence',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "exchange_evidence_customer_upload" on storage.objects for insert to authenticated
with check(bucket_id='exchange-evidence' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "exchange_evidence_read_own_or_admin" on storage.objects for select to authenticated
using(bucket_id='exchange-evidence' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

create or replace function public.customer_create_exchange_request(
  p_request_id uuid, p_order_id uuid, p_request_type text, p_requested_solution text,
  p_items jsonb, p_details text, p_photo_paths jsonb default '[]'::jsonb
) returns public.order_exchange_requests
language plpgsql security definer set search_path=''
as $$
declare target public.orders; saved public.order_exchange_requests; delivered timestamptz;
begin
  select * into target from public.orders where id=p_order_id and user_id=auth.uid();
  if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
  if target.status <> 'paid' then raise exception 'A solicitação fica disponível após a aprovação do pagamento.' using errcode='P0001'; end if;
  if p_request_type not in ('size_exchange','color_exchange','defect','wrong_item','withdrawal','other') then raise exception 'Motivo inválido.'; end if;
  if p_requested_solution not in ('exchange','refund','support') then raise exception 'Solução inválida.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Selecione ao menos um item.'; end if;
  if char_length(trim(coalesce(p_details,'')))<5 then raise exception 'Conte um pouco mais sobre a solicitação.'; end if;
  if jsonb_array_length(coalesce(p_photo_paths,'[]'::jsonb))>3 then raise exception 'Envie no máximo 3 fotos.'; end if;
  if p_request_type in ('defect','wrong_item') and jsonb_array_length(coalesce(p_photo_paths,'[]'::jsonb))=0 then raise exception 'Envie ao menos uma foto do produto.'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(p_photo_paths,'[]'::jsonb)) path where path not like auth.uid()::text||'/'||p_request_id::text||'/%') then raise exception 'Caminho de foto inválido.'; end if;
  select max(s.delivered_at) into delivered from public.shipments s where s.order_id=p_order_id;
  if delivered is null and target.fulfillment_status='completed' then delivered := target.updated_at; end if;
  if p_request_type='withdrawal' and delivered is not null and delivered < now()-interval '7 days' then raise exception 'O prazo de 7 dias para arrependimento terminou.'; end if;
  if p_request_type in ('size_exchange','color_exchange') and delivered is not null and delivered < now()-interval '30 days' then raise exception 'O prazo de 30 dias para troca terminou.'; end if;
  insert into public.order_exchange_requests(id,order_id,user_id,request_type,requested_solution,items,details,photo_paths)
  values(p_request_id,p_order_id,auth.uid(),p_request_type,p_requested_solution,p_items,trim(p_details),coalesce(p_photo_paths,'[]'::jsonb)) returning * into saved;
  return saved;
end; $$;

create or replace function public.customer_cancel_exchange_request(p_request_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.order_exchange_requests set status='cancelled',resolved_at=now()
  where id=p_request_id and user_id=auth.uid() and status in ('received','under_review');
  if not found then raise exception 'Esta solicitação não pode mais ser cancelada.'; end if;
end; $$;

create or replace function public.admin_update_exchange_request(
  p_request_id uuid, p_status text, p_customer_message text default null, p_admin_notes text default null,
  p_return_tracking_code text default null, p_return_tracking_url text default null,
  p_replacement_tracking_code text default null, p_replacement_tracking_url text default null
) returns public.order_exchange_requests language plpgsql security definer set search_path='' as $$
declare saved public.order_exchange_requests;
begin
  if not public.is_admin() then raise exception 'Acesso restrito a administradores.' using errcode='42501'; end if;
  if p_status not in ('received','under_review','awaiting_return','return_in_transit','received_return','exchange_sent','refunded','rejected','cancelled','completed') then raise exception 'Status inválido.'; end if;
  update public.order_exchange_requests set status=p_status,customer_message=nullif(trim(p_customer_message),''),admin_notes=nullif(trim(p_admin_notes),''),return_tracking_code=nullif(trim(p_return_tracking_code),''),return_tracking_url=nullif(trim(p_return_tracking_url),''),replacement_tracking_code=nullif(trim(p_replacement_tracking_code),''),replacement_tracking_url=nullif(trim(p_replacement_tracking_url),''),resolved_at=case when p_status in ('refunded','rejected','cancelled','completed') then now() else null end
  where id=p_request_id returning * into saved;
  if not found then raise exception 'Solicitação não encontrada.'; end if;
  return saved;
end; $$;

revoke all on function public.customer_create_exchange_request(uuid,uuid,text,text,jsonb,text,jsonb) from public;
revoke all on function public.customer_cancel_exchange_request(uuid) from public;
revoke all on function public.admin_update_exchange_request(uuid,text,text,text,text,text,text,text) from public;
grant execute on function public.customer_create_exchange_request(uuid,uuid,text,text,jsonb,text,jsonb) to authenticated;
grant execute on function public.customer_cancel_exchange_request(uuid) to authenticated;
grant execute on function public.admin_update_exchange_request(uuid,text,text,text,text,text,text,text) to authenticated;
