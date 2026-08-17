-- Remove os grants automáticos do Data API e otimiza a política da nova tabela.
revoke execute on function public.customer_request_ticket_refund(uuid,text,text) from anon;
revoke execute on function public.admin_ticket_refund_requests(uuid) from anon;
revoke execute on function public.admin_update_ticket_refund_request(uuid,text,text) from anon;
revoke execute on function public.customer_event_tickets() from anon;

drop policy if exists "ticket_refund_select_own_or_admin" on public.ticket_refund_requests;
create policy "ticket_refund_select_own_or_admin" on public.ticket_refund_requests
for select using (user_id = (select auth.uid()) or (select public.is_admin()));
