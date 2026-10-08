alter table public.site_notifications add column icon text not null default 'bell' check(icon in ('bell','ticket','car','calendar','gift','star','check','alert','message','info'));
create function only_notifications_internal.send_icon(p_recipient uuid,p_title text,p_body text,p_key uuid,p_icon text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_icon is null or p_icon not in ('bell','ticket','car','calendar','gift','star','check','alert','message','info') then raise exception 'Ícone inválido.'; end if;
 result:=only_notifications_internal.send(p_recipient,p_title,p_body,p_key);
 update public.site_notifications set icon=p_icon where id=result and sender_id=auth.uid();
 return result;
end $$;
create function public.admin_send_site_notification_v2(p_recipient uuid,p_title text,p_body text,p_key uuid,p_icon text) returns uuid language sql security invoker set search_path='' as $$ select only_notifications_internal.send_icon(p_recipient,p_title,p_body,p_key,p_icon); $$;
revoke all on function only_notifications_internal.send_icon(uuid,text,text,uuid,text),public.admin_send_site_notification_v2(uuid,text,text,uuid,text) from public,anon;
grant execute on function only_notifications_internal.send_icon(uuid,text,text,uuid,text),public.admin_send_site_notification_v2(uuid,text,text,uuid,text) to authenticated;
create or replace function public.my_site_notifications() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unread_count',(select count(*) from public.site_notifications where read_at is null),'items',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,title,body,icon,created_at,read_at from public.site_notifications order by created_at desc limit 100)n),'[]'::jsonb));
$$;
