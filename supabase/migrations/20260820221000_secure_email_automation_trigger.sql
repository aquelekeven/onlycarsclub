create or replace function public.verify_email_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select length(coalesce(p_secret,'')) >= 32
    and exists (
      select 1
      from vault.decrypted_secrets s
      where s.name='email_cron_secret'
        and s.decrypted_secret=p_secret
    );
$$;

revoke all on function public.verify_email_cron_secret(text) from public,anon,authenticated;
grant execute on function public.verify_email_cron_secret(text) to service_role;
