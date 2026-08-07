-- Only Cars Club — cancelamento seguro de pedido pendente pelo próprio cliente.

create or replace function public.customer_cancel_checkout_order(p_order_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  current_user_id uuid := auth.uid();
  target_order public.orders;
begin
  if current_user_id is null then
    raise exception 'Faça login para cancelar o pedido.' using errcode='42501';
  end if;

  select * into target_order
  from public.orders
  where id=p_order_id and user_id=current_user_id
  for update;

  if not found then raise exception 'Pedido não encontrado.' using errcode='P0002'; end if;
  if target_order.status <> 'pending_payment' then
    raise exception 'Somente pedidos aguardando pagamento podem ser cancelados.' using errcode='P0001';
  end if;

  perform public.cancel_checkout_order(p_order_id,current_user_id,'customer_cancelled');
  return jsonb_build_object('cancelled',true,'order_number',target_order.order_number);
end;
$$;

revoke all on function public.customer_cancel_checkout_order(uuid) from public;
grant execute on function public.customer_cancel_checkout_order(uuid) to authenticated;
