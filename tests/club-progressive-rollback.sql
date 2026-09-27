begin;
do $$
declare uid uuid;owner_id uuid;e public.events%rowtype;sale public.events%rowtype;other_sale public.events%rowtype;n integer;token text;result jsonb;first_order uuid;second_order uuid;buyer jsonb;ticket jsonb;blocked boolean;directory jsonb;sample jsonb;last_name text;name_now text;
begin
 select user_id into owner_id from only_club_internal.owner_account;
 select id into uid from public.profiles where is_test and id<>owner_id limit 1;
 if uid is null then raise exception 'QA account required';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.owner_set_admin(uid,false);
 update public.profiles set is_test=false,birth_date='1990-01-01' where id=uid;
 directory:=public.owner_user_directory('',0,'name_asc');
 for sample in select value from jsonb_array_elements(directory->'users') loop
  name_now:=lower(coalesce(nullif(btrim(sample->>'display_name'),''),sample->>'email',''));
  if last_name is not null and name_now<last_name then raise exception 'Directory ordering failed';end if;last_name:=name_now;
 end loop;
 perform public.owner_set_admin(uid,true);
 if not exists(select 1 from jsonb_array_elements(public.owner_user_directory('',0,'newest')->'admins') a where a->>'id'=uid::text) then raise exception 'Promoted admin missing from group';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 blocked:=false;begin perform public.owner_user_directory();exception when insufficient_privilege then blocked:=true;end;if not blocked then raise exception 'Other admin read directory';end if;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);perform public.owner_set_admin(uid,false);
 if exists(select 1 from jsonb_array_elements(public.owner_user_directory('',0,'newest')->'admins') a where a->>'id'=uid::text) then raise exception 'Revoked admin remained in group';end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select * into sale from public.events where slug='only-cars-meeting-2026';
 sale.id:=gen_random_uuid();sale.slug:='qa-loyalty-sale-'||sale.id::text;sale.name:='QA loyalty sale';insert into public.events select sale.*;
 other_sale:=sale;other_sale.id:=gen_random_uuid();other_sale.slug:='qa-loyalty-sale-'||other_sale.id::text;insert into public.events select other_sale.*;
 buyer:='{"name":"QA Club","email":"qa-club@example.invalid","tax_id":"00000000000","phone":"11999999999"}';
 ticket:='{"ticket_kind":"carona","driver_name":"QA Club","driver_tax_id":"00000000000","driver_phone":"11999999999"}';
 if (public.customer_loyalty()->>'discount_percent')::int<>0 then raise exception 'First event must be zero';end if;
 for n in 1..10 loop
  e:=sale;e.id:=gen_random_uuid();e.slug:='qa-progressive-'||e.id::text;
  e.starts_at:=now()-interval '30 days';e.ends_at:=now()-interval '29 days';e.sales_end_at:=now()-interval '31 days';insert into public.events select e.*;
  token:=gen_random_uuid()::text;
  insert into public.tickets(event_id,owner_user_id,qr_token,qr_token_hash,status,is_complimentary,complimentary_issued_by,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,first_checked_in_at)
  values(e.id,uid,token,encode(extensions.digest(token,'sha256'),'hex'),'checked_in',true,owner_id,'QA Club','00000000000','11999999999','QAP0A01','QA','TEST',now()-interval '30 days');
  result:=public.customer_loyalty();
  if (result->>'discount_percent')::int<>(case when n>=10 then 40 when n>=5 then 30 else n*5 end) then raise exception 'Wrong progressive rate at %: %',n,result;end if;
  if n=4 then
   result:=public.service_reserve_typed_tickets(uid,sale.slug,null,buyer||'{"expected_payable_cents":32400}'::jsonb,jsonb_build_array(ticket,ticket));first_order:=(result->>'order_id')::uuid;
   if (result->>'total_cents')::int<>32400 then raise exception '20 percent applied to more than one ticket';end if;
   if (public.customer_event_loyalty(sale.id)->>'discount_percent')::int<>0 then raise exception 'Preview did not reserve one use';end if;
   result:=public.service_reserve_typed_tickets(uid,sale.slug,null,buyer,jsonb_build_array(ticket,ticket));second_order:=(result->>'order_id')::uuid;
   if (result->>'total_cents')::int<>36000 then raise exception 'Separate order reused event discount';end if;
   update public.ticket_orders set expires_at=now()-interval '1 hour' where id=first_order;
   if (public.customer_event_loyalty(sale.id)->>'discount_percent')::int<>0 then raise exception 'Expired unpaid link allowed duplicate discount';end if;
   update public.ticket_orders set status='cancelled' where id in(first_order,second_order);
   if (public.customer_event_loyalty(sale.id)->>'discount_percent')::int<>20 then raise exception 'Cancellation did not release benefit';end if;
   blocked:=false;begin perform public.service_reserve_typed_tickets(uid,sale.slug,null,buyer||'{"expected_payable_cents":1}'::jsonb,jsonb_build_array(ticket));exception when others then blocked:=true;end;if not blocked then raise exception 'Stale quote accepted';end if;
  end if;
 end loop;
 result:=public.service_reserve_typed_tickets(uid,sale.slug,null,buyer||'{"expected_payable_cents":28800}'::jsonb,jsonb_build_array(ticket,ticket));first_order:=(result->>'order_id')::uuid;
 if (result->>'total_cents')::int<>28800 then raise exception '40 percent bonus wrong';end if;
 if (public.customer_event_loyalty(other_sale.id)->>'discount_percent')::int<>0 then raise exception '40 percent bonus reusable across events';end if;
 if (public.customer_loyalty()->>'cycle_events_count')::int<>10 then raise exception 'Pending payment prematurely reset cycle';end if;
 update public.ticket_orders set status='paid',paid_at=now() where id=first_order;
 result:=public.customer_loyalty();
 if (result->>'cycle_events_count')::int<>0 or (result->>'discount_percent')::int<>0 or (result->>'events_count')::int<>10 then raise exception 'Cycle reset lost history or failed: %',result;end if;
 update public.events set starts_at=now()-interval '1 day',ends_at=now()+interval '1 day',sales_end_at=now()-interval '2 days' where id=sale.id;
 update public.tickets set status='checked_in',first_checked_in_at=now() where order_id=first_order;
 result:=public.customer_loyalty();
 if (result->>'cycle_events_count')::int<>1 or (result->>'events_count')::int<>11 or (result->>'discount_percent')::int<>5 then raise exception 'New cycle or event deduplication failed: %',result;end if;
 if (public.customer_event_loyalty(sale.id)->>'discount_percent')::int<>0 then raise exception 'Cycle reset bypassed per-event limit';end if;
 if has_function_privilege('authenticated','only_club_internal.loyalty_state(uuid)','execute') or has_function_privilege('anon','public.customer_event_loyalty(uuid)','execute') then raise exception 'Private loyalty exposure';end if;
end $$;
select 'PASS: sorted owner directory, live admin grouping, progressive rates, one ticket/event across orders, stale quote rejection, pending bonus hold, paid bonus cycle reset, preserved history and next cycle' as result;
rollback;
