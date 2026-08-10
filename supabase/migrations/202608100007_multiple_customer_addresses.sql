-- Até três endereços por cliente, com um único principal.

create or replace function public.enforce_customer_address_limit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.addresses where user_id=new.user_id) >= 3 then
    raise exception 'Você já possui o limite de 3 endereços salvos.';
  end if;
  return new;
end;
$$;

drop trigger if exists addresses_enforce_limit on public.addresses;
create trigger addresses_enforce_limit before insert on public.addresses
for each row execute function public.enforce_customer_address_limit();

create or replace function public.save_customer_address(
  p_address_id uuid,
  p_label text,
  p_recipient_name text,
  p_postal_code text,
  p_street text,
  p_number text,
  p_complement text,
  p_neighborhood text,
  p_city text,
  p_state text,
  p_is_default boolean default false
)
returns public.addresses
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  saved public.addresses;
  address_count integer;
begin
  if current_user_id is null then raise exception 'Faça login para continuar.'; end if;
  if p_postal_code !~ '^[0-9]{8}$' then raise exception 'Digite um CEP com 8 números.'; end if;
  if upper(trim(p_state)) !~ '^[A-Z]{2}$' then raise exception 'Estado inválido.'; end if;

  if p_address_id is null then
    select count(*) into address_count from public.addresses where user_id = current_user_id;
    if address_count >= 3 then raise exception 'Você já possui o limite de 3 endereços salvos.'; end if;
  elsif not exists (
    select 1 from public.addresses where id = p_address_id and user_id = current_user_id
  ) then
    raise exception 'Endereço não encontrado.';
  end if;

  if p_is_default or not exists (
    select 1 from public.addresses where user_id = current_user_id and is_default
  ) then
    update public.addresses set is_default = false where user_id = current_user_id and is_default;
    p_is_default := true;
  end if;

  if p_address_id is not null and not p_is_default and exists (
    select 1 from public.addresses where id=p_address_id and user_id=current_user_id and is_default
  ) then
    p_is_default := true;
  end if;

  if p_address_id is null then
    insert into public.addresses (
      user_id,label,recipient_name,postal_code,street,number,complement,
      neighborhood,city,state,is_default
    ) values (
      current_user_id,coalesce(nullif(trim(p_label),''),'Endereço'),trim(p_recipient_name),
      p_postal_code,trim(p_street),coalesce(nullif(trim(p_number),''),'S/N'),
      nullif(trim(p_complement),''),trim(p_neighborhood),trim(p_city),upper(trim(p_state)),p_is_default
    ) returning * into saved;
  else
    update public.addresses set
      label=coalesce(nullif(trim(p_label),''),'Endereço'), recipient_name=trim(p_recipient_name),
      postal_code=p_postal_code, street=trim(p_street), number=coalesce(nullif(trim(p_number),''),'S/N'),
      complement=nullif(trim(p_complement),''), neighborhood=trim(p_neighborhood),
      city=trim(p_city), state=upper(trim(p_state)), is_default=p_is_default
    where id=p_address_id and user_id=current_user_id returning * into saved;
  end if;
  return saved;
end;
$$;

create or replace function public.set_default_customer_address(p_address_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.addresses where id=p_address_id and user_id=auth.uid()) then
    raise exception 'Endereço não encontrado.';
  end if;
  update public.addresses set is_default=false where user_id=auth.uid() and is_default;
  update public.addresses set is_default=true where id=p_address_id and user_id=auth.uid();
end;
$$;

create or replace function public.delete_customer_address(p_address_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare was_default boolean;
begin
  select is_default into was_default from public.addresses where id=p_address_id and user_id=auth.uid();
  if not found then raise exception 'Endereço não encontrado.'; end if;
  delete from public.addresses where id=p_address_id and user_id=auth.uid();
  if was_default then
    update public.addresses set is_default=true
    where id=(select id from public.addresses where user_id=auth.uid() order by created_at asc limit 1);
  end if;
end;
$$;

revoke all on function public.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,boolean) from public;
revoke all on function public.set_default_customer_address(uuid) from public;
revoke all on function public.delete_customer_address(uuid) from public;
grant execute on function public.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.set_default_customer_address(uuid) to authenticated;
grant execute on function public.delete_customer_address(uuid) to authenticated;
