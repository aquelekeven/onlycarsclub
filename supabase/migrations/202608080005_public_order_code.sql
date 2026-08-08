create or replace function public.next_public_order_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  attempts integer := 0;
begin
  loop
    candidate := '#' || (1000 + floor(random() * 9000)::integer)::text;
    exit when not exists (
      select 1 from public.orders where order_number = candidate
    );
    attempts := attempts + 1;
    if attempts >= 100 then
      raise exception 'Não foi possível gerar um número público de pedido.';
    end if;
  end loop;
  return candidate;
end;
$$;

alter table public.orders
  alter column order_number set default public.next_public_order_number();

comment on function public.next_public_order_number() is
  'Gera um código público único no formato #4924 para novos pedidos.';
