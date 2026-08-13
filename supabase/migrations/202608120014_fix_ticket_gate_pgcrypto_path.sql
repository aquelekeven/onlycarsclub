-- Permite que as funções seguras da portaria encontrem digest(), encode() e convert_to().
-- O caminho permanece fixo e não depende do search_path do usuário autenticado.

do $$
declare
  pgcrypto_schema text;
begin
  select n.nspname into pgcrypto_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if pgcrypto_schema is null then
    raise exception 'A extensão pgcrypto não está instalada.';
  end if;

  execute format(
    'alter function public.admin_inspect_event_ticket(text) set search_path = pg_catalog, %I',
    pgcrypto_schema
  );

  execute format(
    'alter function public.admin_checkin_event_ticket(text, public.ticket_checkin_type, text) set search_path = pg_catalog, %I',
    pgcrypto_schema
  );
end;
$$;
