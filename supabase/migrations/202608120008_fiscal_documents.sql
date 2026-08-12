-- Only Cars Club — documentos fiscais privados por pedido.

create table if not exists public.order_fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  access_key text not null check (access_key ~ '^[0-9]{44}$'),
  danfe_path text not null,
  xml_path text not null,
  issued_at timestamptz not null,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger order_fiscal_documents_set_updated_at
before update on public.order_fiscal_documents
for each row execute function public.set_updated_at();

alter table public.order_fiscal_documents enable row level security;

create policy "fiscal_documents_select_own_or_admin"
on public.order_fiscal_documents for select to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.orders
    where orders.id = order_fiscal_documents.order_id
      and orders.user_id = auth.uid()
  )
);

create policy "fiscal_documents_admin_insert"
on public.order_fiscal_documents for insert to authenticated
with check (public.is_admin() and uploaded_by = auth.uid());

create policy "fiscal_documents_admin_update"
on public.order_fiscal_documents for update to authenticated
using (public.is_admin())
with check (public.is_admin() and uploaded_by = auth.uid());

create policy "fiscal_documents_admin_delete"
on public.order_fiscal_documents for delete to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiscal-documents',
  'fiscal-documents',
  false,
  5242880,
  array['application/pdf', 'application/xml', 'text/xml']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "fiscal_storage_admin_upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'fiscal-documents'
  and public.is_admin()
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
);

create policy "fiscal_storage_admin_update"
on storage.objects for update to authenticated
using (bucket_id = 'fiscal-documents' and public.is_admin())
with check (bucket_id = 'fiscal-documents' and public.is_admin());

create policy "fiscal_storage_admin_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'fiscal-documents' and public.is_admin());

create policy "fiscal_storage_read_own_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'fiscal-documents'
  and (
    public.is_admin()
    or exists (
      select 1
      from public.order_fiscal_documents document
      join public.orders on orders.id = document.order_id
      where orders.user_id = auth.uid()
        and (
          document.danfe_path = storage.objects.name
          or document.xml_path = storage.objects.name
        )
    )
  )
);

create or replace function public.admin_save_order_fiscal_document(
  target_order_id uuid,
  new_access_key text,
  new_danfe_path text,
  new_xml_path text,
  new_issued_at timestamptz
)
returns public.order_fiscal_documents
language plpgsql security definer set search_path=''
as $$
declare
  target_order public.orders;
  saved_document public.order_fiscal_documents;
  normalized_key text := regexp_replace(coalesce(new_access_key, ''), '[^0-9]', '', 'g');
  expected_prefix text := target_order_id::text || '/';
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode='42501';
  end if;

  select * into target_order from public.orders where id = target_order_id;
  if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
  if target_order.status <> 'paid' then
    raise exception 'A NF-e só pode ser registrada após a aprovação do pagamento.' using errcode='P0001';
  end if;
  if length(normalized_key) <> 44 then
    raise exception 'Informe uma chave de acesso de NF-e com 44 números.' using errcode='22023';
  end if;
  if new_danfe_path <> expected_prefix || 'danfe.pdf' then
    raise exception 'Caminho do DANFE inválido.' using errcode='22023';
  end if;
  if new_xml_path <> expected_prefix || 'nfe.xml' then
    raise exception 'Caminho do XML inválido.' using errcode='22023';
  end if;

  insert into public.order_fiscal_documents(
    order_id, access_key, danfe_path, xml_path, issued_at, uploaded_by
  ) values (
    target_order_id, normalized_key, new_danfe_path, new_xml_path,
    coalesce(new_issued_at, now()), auth.uid()
  )
  on conflict(order_id) do update set
    access_key = excluded.access_key,
    danfe_path = excluded.danfe_path,
    xml_path = excluded.xml_path,
    issued_at = excluded.issued_at,
    uploaded_by = auth.uid()
  returning * into saved_document;

  insert into public.admin_audit_log(actor_user_id, action, entity_type, entity_id, after_data)
  values(auth.uid(), 'order.fiscal_document.save', 'order', target_order_id::text, to_jsonb(saved_document));

  return saved_document;
end;
$$;

revoke all on function public.admin_save_order_fiscal_document(uuid,text,text,text,timestamptz) from public;
grant execute on function public.admin_save_order_fiscal_document(uuid,text,text,text,timestamptz) to authenticated;

-- Pedidos enviados exigem documento fiscal registrado antes da postagem.
create or replace function public.admin_update_order_fulfillment(
  target_order_id uuid,
  new_fulfillment_status public.fulfillment_status,
  new_tracking_code text default null,
  new_tracking_url text default null,
  new_carrier_name text default null,
  new_service_name text default null
)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  before_order public.orders;
  after_order public.orders;
  shipment_row public.shipments;
  normalized_tracking text := nullif(trim(new_tracking_code), '');
  normalized_url text := nullif(trim(new_tracking_url), '');
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.' using errcode='42501';
  end if;

  select * into before_order from public.orders where id=target_order_id for update;
  if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
  if before_order.status <> 'paid' and new_fulfillment_status not in ('new','cancelled') then
    raise exception 'Confirme o pagamento antes de iniciar a preparação.' using errcode='P0001';
  end if;
  if before_order.delivery_method = 'shipping'
     and new_fulfillment_status in ('shipped','completed')
     and not exists (
       select 1 from public.order_fiscal_documents
       where order_id = target_order_id
     ) then
    raise exception 'Registre a NF-e antes de marcar o pedido como postado.' using errcode='P0001';
  end if;

  update public.orders
    set fulfillment_status=new_fulfillment_status
    where id=target_order_id
    returning * into after_order;

  if before_order.delivery_method = 'shipping' then
    insert into public.shipments(
      order_id, provider, service_id, service_name, carrier_name, status,
      price_cents, delivery_days, tracking_code, tracking_url, posted_at, delivered_at
    ) values (
      target_order_id,
      'melhor_envio',
      before_order.shipping_quote->>'service_id',
      coalesce(nullif(trim(new_service_name), ''), before_order.shipping_quote->>'service_name'),
      coalesce(nullif(trim(new_carrier_name), ''), before_order.shipping_quote->>'company_name'),
      case new_fulfillment_status
        when 'shipped' then 'posted'::public.shipment_status
        when 'completed' then 'delivered'::public.shipment_status
        when 'cancelled' then 'cancelled'::public.shipment_status
        else 'waiting_label'::public.shipment_status
      end,
      before_order.shipping_cents,
      nullif(before_order.shipping_quote->>'delivery_time','')::integer,
      normalized_tracking,
      normalized_url,
      case when new_fulfillment_status in ('shipped','completed') then now() else null end,
      case when new_fulfillment_status='completed' then now() else null end
    )
    on conflict(order_id) do update set
      service_name=coalesce(excluded.service_name,public.shipments.service_name),
      carrier_name=coalesce(excluded.carrier_name,public.shipments.carrier_name),
      status=excluded.status,
      tracking_code=coalesce(excluded.tracking_code,public.shipments.tracking_code),
      tracking_url=coalesce(excluded.tracking_url,public.shipments.tracking_url),
      posted_at=coalesce(public.shipments.posted_at,excluded.posted_at),
      delivered_at=coalesce(public.shipments.delivered_at,excluded.delivered_at)
    returning * into shipment_row;
  end if;

  insert into public.admin_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(
    auth.uid(),'order.fulfillment.update','order',target_order_id::text,
    to_jsonb(before_order),
    jsonb_build_object('order',to_jsonb(after_order),'shipment',to_jsonb(shipment_row))
  );

  return jsonb_build_object('order',to_jsonb(after_order),'shipment',to_jsonb(shipment_row));
end;
$$;

revoke all on function public.admin_update_order_fulfillment(uuid,public.fulfillment_status,text,text,text,text) from public;
grant execute on function public.admin_update_order_fulfillment(uuid,public.fulfillment_status,text,text,text,text) to authenticated;

comment on table public.order_fiscal_documents is
  'NF-e de pedidos: acesso restrito ao administrador e ao usuário proprietário do pedido.';
