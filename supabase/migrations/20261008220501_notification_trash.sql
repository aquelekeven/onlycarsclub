alter table public.site_notifications add column trashed_at timestamptz;
create index site_notifications_trash_expiry on public.site_notifications(trashed_at) where trashed_at is not null;
create function only_notifications_internal.trash(p_id uuid,p_restore boolean) returns integer language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_restore then
  update public.site_notifications set trashed_at=null where recipient_id=auth.uid() and id=p_id and trashed_at>now()-interval '3 days';
 else
  update public.site_notifications set trashed_at=now() where recipient_id=auth.uid() and (p_id is null or id=p_id) and trashed_at is null;
 end if;
 get diagnostics affected=row_count; return affected;
end $$;
create function public.trash_site_notifications(p_id uuid default null,p_restore boolean default false) returns integer language sql security invoker set search_path='' as $$select only_notifications_internal.trash(p_id,p_restore)$$;
revoke all on function only_notifications_internal.trash(uuid,boolean),public.trash_site_notifications(uuid,boolean) from public,anon;
grant execute on function only_notifications_internal.trash(uuid,boolean),public.trash_site_notifications(uuid,boolean) to authenticated;
create or replace function public.my_site_notifications() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unread_count',(select count(*) from public.site_notifications where read_at is null and trashed_at is null and recipient_id=auth.uid() and public.is_admin()),'items',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc,n.id desc) from (select id,title,body,icon,link_url,link_label,created_at,read_at,trashed_at from public.site_notifications where recipient_id=auth.uid() and public.is_admin() and (trashed_at is null or trashed_at>now()-interval '3 days') order by created_at desc,id desc)n),'[]'::jsonb));
$$;
select cron.schedule('only-notifications-trash-cleanup','17 * * * *', $$delete from public.site_notifications where trashed_at<=now()-interval '3 days'$$);
