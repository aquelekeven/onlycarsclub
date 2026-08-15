-- Only Cars Club — fila administrativa de fotos para posts de confirmação.

alter table public.ticket_media
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid references public.profiles(id) on delete set null;

create or replace function public.admin_event_confirmation_photos(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', media.id,
      'status', media.status,
      'posted', media.posted_at is not null,
      'storage_path', media.storage_path,
      'created_at', media.created_at,
      'posted_at', media.posted_at,
      'ticket_id', ticket.id,
      'ticket_code', ticket.ticket_code,
      'driver_name', ticket.driver_name,
      'vehicle_plate', ticket.vehicle_plate,
      'vehicle_make', ticket.vehicle_make,
      'vehicle_model', ticket.vehicle_model,
      'instagram_handle', coalesce(nullif(media.instagram_handle, ''), nullif(ticket.instagram_handle, ''))
    ) order by coalesce(media.posted_at, media.created_at) desc)
    from public.ticket_media media
    join public.tickets ticket on ticket.id = media.ticket_id
    join public.ticket_orders ticket_order on ticket_order.id = ticket.order_id
    where ticket.event_id = p_event_id
      and ticket_order.status = 'paid'
      and ticket.status in ('active', 'checked_in')
      and media.status in ('pending', 'approved')
  ), '[]'::jsonb);
end;
$$;

create or replace function public.admin_set_confirmation_photo_posted(
  p_media_id uuid,
  p_posted boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved public.ticket_media%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Acesso não autorizado.' using errcode = '42501';
  end if;

  update public.ticket_media
  set
    status = case when p_posted then 'approved'::public.ticket_media_status else 'pending'::public.ticket_media_status end,
    posted_at = case when p_posted then now() else null end,
    posted_by = case when p_posted then auth.uid() else null end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = p_media_id
    and status in ('pending', 'approved')
  returning * into saved;

  if saved.id is null then
    raise exception 'Foto não encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', saved.id,
    'status', saved.status,
    'posted_at', saved.posted_at
  );
end;
$$;

revoke all on function public.admin_event_confirmation_photos(uuid) from public;
revoke all on function public.admin_set_confirmation_photo_posted(uuid, boolean) from public;
grant execute on function public.admin_event_confirmation_photos(uuid) to authenticated;
grant execute on function public.admin_set_confirmation_photo_posted(uuid, boolean) to authenticated;
