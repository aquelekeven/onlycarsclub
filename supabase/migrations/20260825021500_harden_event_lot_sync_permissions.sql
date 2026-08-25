revoke all on function public.sync_event_active_lot(uuid) from public;
revoke all on function public.sync_event_active_lot(uuid) from anon;
revoke all on function public.sync_event_active_lot(uuid) from authenticated;
grant execute on function public.sync_event_active_lot(uuid) to service_role;
