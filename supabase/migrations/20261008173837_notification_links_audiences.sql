alter table public.site_notifications add column link_url text, add column link_label text;
create function only_notifications_internal.audience(p_segment text,p_event uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_segment not in ('all','expo','carona','combo','courtesy','no_purchase') or p_segment is null then raise exception 'Filtro inválido.'; end if;
 if p_segment<>'all' and p_event is null then raise exception 'Selecione um evento para este filtro.'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name) order by p.display_name),'[]'::jsonb) from public.profiles p where p.role='admin' and (p_segment='all' or
 (p_segment='no_purchase' and not exists(select 1 from public.tickets t join public.ticket_orders o on o.id=t.order_id where t.owner_user_id=p.id and t.event_id=p_event and o.status='paid' and t.status in ('active','checked_in'))) or
 exists(select 1 from public.tickets t left join public.ticket_orders o on o.id=t.order_id where t.owner_user_id=p.id and t.event_id=p_event and t.status in ('active','checked_in') and ((p_segment='courtesy' and t.is_complimentary) or (p_segment in ('expo','carona','combo') and t.ticket_kind=p_segment and o.status='paid' and not t.is_complimentary)))));
end $$;
create function public.admin_notification_audience(p_segment text,p_event uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select only_notifications_internal.audience(p_segment,p_event); $$;
create function only_notifications_internal.send_group(p_recipients uuid[],p_title text,p_body text,p_key uuid,p_icon text,p_url text,p_label text) returns integer language plpgsql security definer set search_path='' as $$
declare recipient uuid; result uuid; total integer:=0; url text:=nullif(btrim(p_url),''); label text:=nullif(btrim(p_label),'');
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito.' using errcode='42501'; end if;
 if p_key is null or coalesce(cardinality(p_recipients),0) not between 1 and 100 then raise exception 'Selecione de 1 a 100 destinatários.'; end if;
 if url is not null and (length(url)>2048 or url ~ '[[:space:]]' or position(chr(92) in url)>0 or not (url ~ '^https://[a-zA-Z0-9][^[:space:]]*$' or (url like '/%' and url not like '//%'))) then raise exception 'Use um link HTTPS ou um caminho do site começando com /.'; end if;
 if length(coalesce(label,''))>60 then raise exception 'Texto do botão muito longo.'; end if;
 for recipient in select distinct unnest(p_recipients) loop
  result:=only_notifications_internal.send_icon(recipient,p_title,p_body,(md5(p_key::text||recipient::text))::uuid,p_icon);
  update public.site_notifications set link_url=url,link_label=case when url is null then null else coalesce(label,'Ver detalhes') end where id=result and sender_id=auth.uid();
  total:=total+1;
 end loop;
 return total;
end $$;
create function public.admin_send_site_notification_v3(p_recipients uuid[],p_title text,p_body text,p_key uuid,p_icon text,p_url text default null,p_label text default null) returns integer language sql security invoker set search_path='' as $$ select only_notifications_internal.send_group(p_recipients,p_title,p_body,p_key,p_icon,p_url,p_label); $$;
revoke all on function only_notifications_internal.audience(text,uuid),only_notifications_internal.send_group(uuid[],text,text,uuid,text,text,text),public.admin_notification_audience(text,uuid),public.admin_send_site_notification_v3(uuid[],text,text,uuid,text,text,text) from public,anon;
grant execute on function only_notifications_internal.audience(text,uuid),only_notifications_internal.send_group(uuid[],text,text,uuid,text,text,text),public.admin_notification_audience(text,uuid),public.admin_send_site_notification_v3(uuid[],text,text,uuid,text,text,text) to authenticated;
create or replace function public.my_site_notifications() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('unread_count',(select count(*) from public.site_notifications where read_at is null and recipient_id=auth.uid() and public.is_admin()),'items',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,title,body,icon,link_url,link_label,created_at,read_at from public.site_notifications where recipient_id=auth.uid() and public.is_admin() order by created_at desc limit 100)n),'[]'::jsonb));
$$;
