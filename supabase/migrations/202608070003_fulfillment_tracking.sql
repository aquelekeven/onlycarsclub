-- Only Cars Club — acompanhamento de produção, envio e rastreio.

alter table public.shipments
  add column if not exists tracking_url text;

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

comment on column public.shipments.tracking_url is
  'Link público e seguro para acompanhamento do envio pelo cliente.';
