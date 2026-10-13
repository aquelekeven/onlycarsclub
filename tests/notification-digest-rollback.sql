begin;
do $test$
declare u uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); b bigint; n integer; token uuid; snapshot jsonb;
begin
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(u,'only-digest-test@example.invalid',now(),'{"display_name":"Digest Test"}'),(other,'only-digest-other@example.invalid',now(),'{"display_name":"Other Test"}');
 insert into public.profiles(id,display_name) values(u,'Digest Test'),(other,'Other Test') on conflict(id) do nothing;
 insert into public.site_notifications(recipient_id,title,body) select u,'Test','Test' from generate_series(1,2);
 if public.enqueue_notification_digests(u)<>0 then raise exception 'Sent before threshold'; end if;
 insert into public.site_notifications(recipient_id,title,body) values(u,'Third','Test');
 if public.enqueue_notification_digests(u)<>1 then raise exception 'Missing batch at 3'; end if;
 if public.enqueue_notification_digests(u)<>0 then raise exception 'Duplicate batch'; end if;
 select email_batch_id into b from public.site_notifications where recipient_id=u limit 1;
 snapshot:=public.notification_digest_status(b);
 if (snapshot->>'unread_count')::int<>3 or (snapshot->>'batch_unread_count')::int<>3 then raise exception 'Wrong unread count'; end if;
 update public.site_notifications set read_at=now() where id=(select id from public.site_notifications where recipient_id=u limit 1);
 if (public.notification_digest_status(b)->>'batch_unread_count')::int<>2 then raise exception 'Read before send not reflected'; end if;
 update public.site_notifications set read_at=null where recipient_id=u;
 if public.enqueue_notification_digests(u)<>0 then raise exception 'Mark unread duplicated batch'; end if;
 insert into public.site_notifications(recipient_id,title,body,trashed_at) values(u,'Trash','Test',now());
 insert into public.site_notifications(recipient_id,title,body,read_at) values(u,'Read','Test',now());
 if public.enqueue_notification_digests(u)<>0 then raise exception 'Read/trash counted'; end if;
 insert into public.site_notifications(recipient_id,title,body) select u,'New','Test' from generate_series(1,3);
 if public.enqueue_notification_digests(u)<>1 then raise exception 'Next 3 missing'; end if;
 select unsubscribe_token into token from public.only_email_preference('only-digest-test@example.invalid');
 perform public.only_email_unsubscribe(token);
 if exists(select 1 from public.transactional_email_outbox where recipient_email='only-digest-test@example.invalid' and status<>'suppressed') then raise exception 'Unsubscribe did not suppress'; end if;
 insert into public.site_notifications(recipient_id,title,body) select u,'Optout','Test' from generate_series(1,3);
 if public.enqueue_notification_digests(u)<>0 then raise exception 'Optout ignored'; end if;
 insert into public.site_notifications(recipient_id,title,body) values(other,'Private','Test');
 perform set_config('request.jwt.claim.sub',u::text,true);
 execute 'set local role authenticated';
 if exists(select 1 from public.site_notifications where recipient_id=other) then raise exception 'Cross-user read'; end if;
 if (public.my_site_notifications()->>'unread_count')::int<>9 then raise exception 'Member count incorrect'; end if;
 begin
  perform public.admin_notification_recipients();
  raise exception 'Member accessed admin sender';
 exception when insufficient_privilege then null; end;
 begin
  perform public.enqueue_notification_digests(u);
  raise exception 'Member accessed service queue';
 exception when insufficient_privilege then null; end;
 perform public.trash_site_notifications(null,false);
 if (public.my_site_notifications()->>'unread_count')::int<>0 then raise exception 'Member trash failed'; end if;
 execute 'reset role';
end $test$;
rollback;
