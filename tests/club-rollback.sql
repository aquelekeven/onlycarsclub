begin;
-- No fixture, role change, reservation, or email queue entry survives this transaction.
do $$
declare uid uuid; owner_id uuid; e public.events%rowtype; event_id uuid; ticket_id uuid; token text; n integer; result jsonb; blocked boolean; buyer jsonb; ticket jsonb;
begin
 select user_id into owner_id from only_club_internal.owner_account;
 select id into uid from public.profiles where is_test and id<>owner_id limit 1;
 if uid is null then raise exception 'QA account required'; end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.owner_set_admin(uid,false);
 update public.profiles set is_test=false,birth_date='1990-01-01' where id=uid;
 if (public.owner_list_users('',0)->>'total')::int<1 then raise exception 'User listing failed'; end if;
 blocked:=false;begin perform public.owner_set_admin(owner_id,false);exception when others then blocked:=true;end;
 if not blocked then raise exception 'Owner could be removed';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 blocked:=false;begin perform public.owner_list_users();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Customer read all users';end if;
 blocked:=false;begin perform public.owner_set_admin(uid,true);exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Customer escalated role';end if;
 blocked:=false;begin update public.profiles set role='admin' where id=uid;exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Direct role update bypass';end if;
 blocked:=false;begin perform public.admin_loyalty_ranking();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Customer read ranking';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.owner_set_admin(uid,true);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.admin_loyalty_ranking();
 blocked:=false;begin perform public.owner_list_users();exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Ordinary admin read owner directory';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.owner_set_admin(uid,false);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 if public.is_admin() then raise exception 'Revocation not immediate';end if;
 select * into e from public.events where slug='only-cars-meeting-2026';
 for n in 1..20 loop
  e.id:=gen_random_uuid();e.slug:='qa-club-'||e.id::text;e.name:='QA Club '||n;
  e.starts_at:=now()-interval '30 days';e.ends_at:=now()-interval '29 days';e.sales_end_at:=now()-interval '31 days';
  insert into public.events select e.*;
  event_id:=e.id;token:=gen_random_uuid()::text||gen_random_uuid()::text;
  insert into public.tickets(event_id,owner_user_id,qr_token,qr_token_hash,status,is_complimentary,complimentary_issued_by,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,first_checked_in_at)
  values(event_id,uid,token,encode(extensions.digest(token,'sha256'),'hex'),'checked_in',true,owner_id,'QA Club','00000000000','11999999999','QAL0A01','QA','TEST',now()-interval '30 days') returning id into ticket_id;
  result:=public.customer_loyalty();
  if (result->>'events_count')::int<>n then raise exception 'Attendance count mismatch at %',n;end if;
  if (result->>'discount_percent')::int<>(case when n>=10 then 40 when n>=5 then 30 else n*5 end) then raise exception 'Discount threshold at %',n;end if;
  if (result->>'shirts_earned')::int<>n/5 or (result->>'hoodies_earned')::int<>n/10 then raise exception 'Recurring gift count at %',n;end if;
 end loop;
 -- Duplicate tickets and re-entry never add another event.
 token:=gen_random_uuid()::text;
 insert into public.tickets(event_id,owner_user_id,qr_token,qr_token_hash,status,is_complimentary,complimentary_issued_by,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,first_checked_in_at)
 values(event_id,uid,token,encode(extensions.digest(token,'sha256'),'hex'),'checked_in',true,owner_id,'QA Club','00000000000','11999999999','QAL0A02','QA','TEST',now());
 if (public.customer_loyalty()->>'events_count')::int<>20 then raise exception 'Duplicate event counted';end if;
 update public.tickets set status='cancelled' where owner_user_id=uid and public.tickets.event_id=e.id;
 if (public.customer_loyalty()->>'events_count')::int<>19 then raise exception 'Cancelled attendance counted';end if;
 update public.profiles set is_test=true where id=uid;
 if (public.customer_loyalty()->>'events_count')::int<>0 then raise exception 'QA counted';end if;
 update public.profiles set is_test=false where id=uid;
 buyer:='{"name":"QA Club","email":"qa-club@example.invalid","tax_id":"00000000000","phone":"11999999999"}';
 ticket:='{"ticket_kind":"carona","driver_name":"QA Club","driver_tax_id":"00000000000","driver_phone":"11999999999"}';
 result:=public.service_reserve_typed_tickets(uid,'only-cars-meeting-2026',null,buyer,jsonb_build_array(ticket));
 if (result->>'total_cents')::int<>10800 then raise exception 'Server loyalty pricing failed: %',result;end if;
 if not exists(select 1 from public.ticket_orders where id=(result->>'order_id')::uuid and payable_cents=10800 and discount_cents=7200) then raise exception 'Stored payment total mismatch';end if;
 if has_function_privilege('anon','public.customer_loyalty()','execute') then raise exception 'Anonymous loyalty exposure';end if;
 if has_function_privilege('authenticated','only_club_internal.discount_for(uuid)','execute') then raise exception 'Arbitrary user lookup exposed';end if;
end $$;
select 'PASS: owner-only roles, direct escalation blocked, immediate revocation, private ranking, 0–20 milestones, duplicate/cancelled/QA exclusions and server payment total' as result;
rollback;
