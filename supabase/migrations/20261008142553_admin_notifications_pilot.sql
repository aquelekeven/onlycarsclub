create schema if not exists only_notifications_internal;
revoke all on schema only_notifications_internal from public, anon;
grant usage on schema only_notifications_internal to authenticated;
create table public.site_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 sender_id uuid references public.profiles(id) on delete set null,
 title text not null check (length(title) between 1 and 100),
 body text not null check (length(body) between 1 and 2000),
 created_at timestamptz not null default now(),
 read_at timestamptz,
 request_key uuid,
 unique(sender_id,request_key)
);
create index site_notifications_recipient_created on public.site_notifications(recipient_id,created_at desc);
create index site_notifications_unread on public.site_notifications(recipient_id) where read_at is null;
create index site_notifications_sender on public.site_notifications(sender_id);
alter table public.site_notifications enable row level security;
revoke all on public.site_notifications from public,anon,authenticated;
grant select on public.site_notifications to authenticated;
grant update(read_at) on public.site_notifications to authenticated;
create policy notifications_own_select on public.site_notifications for select to authenticated
using (recipient_id=(select auth.uid()) and (select public.is_admin()));
create policy notifications_own_read on public.site_notifications for update to authenticated
using (recipient_id=(select auth.uid()) and (select public.is_admin()))
with check (recipient_id=(select auth.uid()) and (select public.is_admin()));
create function public.my_site_notifications() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unread_count',(select count(*) from public.site_notifications where read_at is null),'items',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,title,body,created_at,read_at from public.site_notifications order by created_at desc limit 100)n),'[]'::jsonb));
$$;
create function public.read_site_notification(p_id uuid) returns void language sql security invoker set search_path='' as $$
 update public.site_notifications set read_at=coalesce(read_at,now()) where id=p_id;
$$;
create function only_notifications_internal.recipients() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',display_name) order by display_name),'[]'::jsonb) from public.profiles where role='admin');
end $$;
create function public.admin_notification_recipients() returns jsonb language sql security invoker set search_path='' as $$ select only_notifications_internal.recipients(); $$;
create function only_notifications_internal.send(p_recipient uuid,p_title text,p_body text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_key is null or length(btrim(p_title)) not between 1 and 100 or length(btrim(p_body)) not between 1 and 2000 or p_title is null or p_body is null then raise exception 'Preencha título e mensagem.'; end if;
 perform 1 from public.profiles where id=p_recipient and role='admin' for share;
 if not found then raise exception 'Nesta fase, apenas administradores podem receber notificações.'; end if;
 insert into public.site_notifications(recipient_id,sender_id,title,body,request_key) values(p_recipient,auth.uid(),btrim(p_title),btrim(p_body),p_key)
 on conflict(sender_id,request_key) do nothing returning id into result;
 if result is null then select id into result from public.site_notifications where sender_id=auth.uid() and request_key=p_key; end if;
 return result;
end $$;
create function public.admin_send_site_notification(p_recipient uuid,p_title text,p_body text,p_key uuid) returns uuid language sql security invoker set search_path='' as $$ select only_notifications_internal.send(p_recipient,p_title,p_body,p_key); $$;
revoke all on function only_notifications_internal.recipients(),only_notifications_internal.send(uuid,text,text,uuid) from public,anon;
grant execute on function only_notifications_internal.recipients(),only_notifications_internal.send(uuid,text,text,uuid) to authenticated;
revoke all on function public.my_site_notifications(),public.read_site_notification(uuid),public.admin_notification_recipients(),public.admin_send_site_notification(uuid,text,text,uuid) from public,anon;
grant execute on function public.my_site_notifications(),public.read_site_notification(uuid),public.admin_notification_recipients(),public.admin_send_site_notification(uuid,text,text,uuid) to authenticated;
