begin;
-- All fixtures and state changes stay inside the caller's rollback transaction.
do $$
declare uid uuid; admin_id uuid; e uuid; lot uuid; x jsonb; b jsonb; tickets_json jsonb; r jsonb; tok text; initial_remaining integer; expo_price integer; expected integer; failed boolean; cnt integer;
begin
 select id into uid from public.profiles where is_test limit 1;
 if uid is null then raise exception 'QA profile required'; end if;
 select id into admin_id from public.profiles where role='admin' and not is_test limit 1;
 -- Changes to the QA profile are rolled back with the entire test.
 update public.profiles set birth_date='1990-01-01',role='customer' where id=uid;
 select id into e from public.events where slug='only-cars-meeting-2026';
 select id,price_cents into lot,expo_price from public.event_lots where event_id=e and active;
 initial_remaining:=(public.public_event_summary('only-cars-meeting-2026')->>'remaining_public')::integer;
 b:='{"name":"QA MODALIDADES","email":"qa-modalidades@example.invalid","tax_id":"00000000000","phone":"11999999999"}';
 x:='{"ticket_kind":"carona","driver_name":"QA MODALIDADES","driver_tax_id":"00000000000","driver_phone":"11999999999"}';
 r:=public.service_reserve_typed_tickets(uid,'only-cars-meeting-2026',null,b,jsonb_build_array(x));
 if (r->>'total_cents')::integer<>18000 then raise exception 'Carona pricing failed'; end if;
 if (public.public_event_summary('only-cars-meeting-2026')->>'remaining_public')::integer<>initial_remaining then raise exception 'Carona consumed Expo inventory'; end if;
 if (select lot_id is not null from public.ticket_orders where id=(r->>'order_id')::uuid) then raise exception 'Carona unexpectedly has Expo lot'; end if;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 if not exists(select 1 from jsonb_array_elements(public.customer_event_tickets()) t where t->>'order_id'=r->>'order_id' and t->>'ticket_kind'='carona') then raise exception 'Carona missing from customer tickets'; end if;
 -- Mixed purchase: 1 Expo + 1 Carona + 1 Combo.
 tickets_json:=jsonb_build_array(x||'{"ticket_kind":"expo","vehicle_plate":"QAT0A01","vehicle_make":"QA","vehicle_model":"TESTE"}'::jsonb,x,x||'{"ticket_kind":"combo","vehicle_plate":"QAT0A02","vehicle_make":"QA","vehicle_model":"TESTE"}'::jsonb);
 expected:=expo_price+18000+round((expo_price+18000)*0.9)::integer;
 r:=public.service_reserve_typed_tickets(uid,'only-cars-meeting-2026',lot,b,tickets_json,null,expected);
 if (r->>'total_cents')::integer<>expected then raise exception 'Mixed price failed'; end if;
 if (public.public_event_summary('only-cars-meeting-2026')->>'remaining_public')::integer<>initial_remaining-2 then raise exception 'Mixed Expo inventory failed'; end if;
 if (select sum(face_price_cents) from public.tickets where order_id=(r->>'order_id')::uuid)<>expected then raise exception 'Ticket sum failed'; end if;
 select qr_token into tok from public.tickets where order_id=(r->>'order_id')::uuid and ticket_kind='combo';
 -- Non-admin rejected, then unpaid rejected even for admin.
 failed:=false;begin perform public.admin_redeem_carona(tok);exception when others then failed:=true;end;if not failed then raise exception 'Customer redeemed ride';end if;
 perform set_config('request.jwt.claim.sub',admin_id::text,true);
 failed:=false;begin perform public.admin_redeem_carona(tok);exception when others then failed:=true;end;if not failed then raise exception 'Unpaid ride redeemed';end if;
 update public.ticket_orders set status='paid' where id=(r->>'order_id')::uuid;
 update public.tickets set status='active' where order_id=(r->>'order_id')::uuid;
 perform public.admin_checkin_event_ticket(tok,'entry',null);
 perform public.admin_redeem_carona(tok);
 if not exists(select 1 from public.tickets where qr_token=tok and status='checked_in' and carona_redeemed_at is not null) then raise exception 'Independent combo entitlements failed';end if;
 failed:=false;begin perform public.admin_redeem_carona(tok);exception when others then failed:=true;end;if not failed then raise exception 'Duplicate ride accepted';end if;
 select qr_token into tok from public.tickets where order_id=(r->>'order_id')::uuid and ticket_kind='carona';
 failed:=false;begin perform public.admin_checkin_event_ticket(tok,'entry',null);exception when others then failed:=true;end;if not failed then raise exception 'Carona accepted as Expo';end if;
 perform public.admin_redeem_carona(tok);
 -- Tampering, duplicate plates and incorrect expected price are rejected atomically.
 select count(*) into cnt from public.ticket_orders;
 failed:=false;begin perform public.service_reserve_typed_tickets(uid,'only-cars-meeting-2026',lot,b,jsonb_build_array(x||'{"ticket_kind":"vip"}'::jsonb));exception when others then failed:=true;end;if not failed then raise exception 'Unknown modality accepted';end if;
 failed:=false;begin perform public.service_reserve_typed_tickets(uid,'only-cars-meeting-2026',null,b,jsonb_build_array(x),null,1);exception when others then failed:=true;end;if not failed then raise exception 'Tampered price accepted';end if;
 failed:=false;begin perform public.service_reserve_typed_tickets(uid,'only-cars-meeting-2026',lot,b,jsonb_build_array(tickets_json->0,tickets_json->0));exception when others then failed:=true;end;if not failed then raise exception 'Duplicate plate accepted';end if;
 if (select count(*) from public.ticket_orders)<>cnt then raise exception 'Failed requests left partial orders';end if;
 if has_function_privilege('anon','public.service_reserve_typed_tickets(uuid,text,uuid,jsonb,jsonb,text,integer)','execute') or has_function_privilege('authenticated','public.service_reserve_typed_tickets(uuid,text,uuid,jsonb,jsonb,text,integer)','execute') then raise exception 'Reservation API exposed';end if;
 -- No remaining Expo capacity: ride must still be purchasable.
 update public.event_lots set capacity=1 where id=lot;
 r:=public.service_reserve_typed_tickets(uid,'only-cars-meeting-2026',null,b,jsonb_build_array(x));
 if (r->>'total_cents')::integer<>18000 then raise exception 'Ride failed with full Expo';end if;
end $$;

rollback;
