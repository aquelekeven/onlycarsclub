-- Both functions have a fixed empty search_path and EXECUTE restricted to service_role.
alter function public.enqueue_notification_digests(uuid) security definer;
alter function public.notification_digest_status(bigint) security definer;
