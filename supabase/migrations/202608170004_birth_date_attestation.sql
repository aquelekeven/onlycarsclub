-- Only Cars Club — alteração auditável da data de nascimento.
alter table public.profiles
  add column if not exists birth_date_attested_at timestamptz,
  add column if not exists birth_date_attestation_version text;

revoke update (birth_date, birth_date_attested_at, birth_date_attestation_version)
on table public.profiles from authenticated;

create or replace function public.customer_update_birth_date(
  p_birth_date date,
  p_attested boolean
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Faça login para alterar sua data de nascimento.' using errcode='42501'; end if;
  if not coalesce(p_attested,false) then
    raise exception 'Confirme a declaração de responsabilidade para continuar.' using errcode='22023';
  end if;
  if p_birth_date is null or p_birth_date > current_date or p_birth_date < date '1900-01-01' then
    raise exception 'Informe uma data de nascimento válida.' using errcode='22023';
  end if;
  update public.profiles set
    birth_date=p_birth_date,
    birth_date_attested_at=now(),
    birth_date_attestation_version='2026-08-17',
    updated_at=now()
  where id=auth.uid();
  return jsonb_build_object('birth_date',p_birth_date,'attested_at',now());
end;
$$;

revoke all on function public.customer_update_birth_date(date,boolean) from public, anon;
grant execute on function public.customer_update_birth_date(date,boolean) to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare supplied_birth_date date;
begin
  begin
    supplied_birth_date := nullif(new.raw_user_meta_data ->> 'birth_date', '')::date;
  exception when others then supplied_birth_date := null;
  end;
  insert into public.profiles (
    id,display_name,birth_date,birth_date_attested_at,birth_date_attestation_version
  ) values (
    new.id,nullif(trim(new.raw_user_meta_data ->> 'name'),''),supplied_birth_date,
    case when coalesce((new.raw_user_meta_data ->> 'birth_date_attested')::boolean,false) then now() else null end,
    case when coalesce((new.raw_user_meta_data ->> 'birth_date_attested')::boolean,false) then '2026-08-17' else null end
  );
  return new;
end;
$$;
