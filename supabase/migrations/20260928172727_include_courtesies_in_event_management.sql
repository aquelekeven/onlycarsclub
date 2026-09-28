-- Courtesy tickets have no ticket_order. Include them in the participant history
-- and photo queue while keeping paid revenue statistics separate.
create or replace function public.admin_event_ticket_sales(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Acesso negado.' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'ticket_id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,
      'is_complimentary',t.is_complimentary,
      'driver_name',t.driver_name,'driver_tax_id',t.driver_tax_id,'driver_phone',t.driver_phone,
      'ticket_kind',t.ticket_kind,'carona_redeemed_at',t.carona_redeemed_at,
      'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,
      'vehicle_year',t.vehicle_year,'instagram_handle',t.instagram_handle,
      'order_id',o.id,'customer_email',coalesce(o.customer_email,u.email),
      'subtotal_cents',case when t.is_complimentary then 0 else coalesce(t.face_price_cents,o.unit_price_cents) end,
      'discount_cents',case when t.is_complimentary then 0 else round(o.discount_cents::numeric/o.quantity)::integer end,
      'total_cents',case when t.is_complimentary then 0 else coalesce(t.face_price_cents,o.unit_price_cents)-round(o.discount_cents::numeric/o.quantity)::integer end,
      'order_total_cents',case when t.is_complimentary then 0 else o.payable_cents end,
      'order_quantity',case when t.is_complimentary then 1 else o.quantity end,
      'coupon_code',o.coupon_code,'payment_method',o.payment_method,
      'paid_at',o.paid_at,'created_at',coalesce(o.created_at,t.created_at),
      'photo',case when m.id is null then null else jsonb_build_object(
        'storage_path',m.storage_path,'submission_count',m.submission_count,
        'status',m.status,'created_at',m.created_at) end
    ) order by coalesce(o.created_at,t.created_at) desc,t.created_at)
    from public.tickets t
    left join public.ticket_orders o on o.id=t.order_id
    join auth.users u on u.id=t.owner_user_id
    left join public.ticket_media m on m.ticket_id=t.id
    where t.event_id=p_event_id
      and (o.status='paid' or (t.is_complimentary and t.status in ('reserved','active','checked_in')))
  ),'[]'::jsonb);
end $$;
revoke all on function public.admin_event_ticket_sales(uuid) from public,anon;
grant execute on function public.admin_event_ticket_sales(uuid) to authenticated;

create or replace function public.admin_event_confirmation_photos(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not public.is_admin() then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',media.id,'status',media.status,'posted',media.posted_at is not null,
      'storage_path',media.storage_path,'created_at',media.created_at,'posted_at',media.posted_at,
      'ticket_id',ticket.id,'ticket_code',ticket.ticket_code,'driver_name',ticket.driver_name,
      'vehicle_plate',ticket.vehicle_plate,'vehicle_make',ticket.vehicle_make,'vehicle_model',ticket.vehicle_model,
      'instagram_handle',coalesce(nullif(media.instagram_handle,''),nullif(ticket.instagram_handle,''))
    ) order by coalesce(media.posted_at,media.created_at) desc)
    from public.ticket_media media
    join public.tickets ticket on ticket.id=media.ticket_id
    left join public.ticket_orders ticket_order on ticket_order.id=ticket.order_id
    where ticket.event_id=p_event_id
      and (ticket.is_complimentary or ticket_order.status='paid')
      and ticket.status in ('active','checked_in')
      and media.status in ('pending','approved')
  ),'[]'::jsonb);
end $$;
revoke all on function public.admin_event_confirmation_photos(uuid) from public,anon;
grant execute on function public.admin_event_confirmation_photos(uuid) to authenticated;

-- Expo courtesy check-in already accepts an active ticket. Apply the same rule to
-- Carona courtesy redemption; never allow a reserved or invalid ticket through.
create or replace function only_ticket_internal.redeem_carona(p_qr_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tickets%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso restrito aos administradores.' using errcode='42501';
  end if;
  select * into t from public.tickets
  where qr_token_hash=encode(extensions.digest(convert_to(btrim(p_qr_token),'UTF8'),'sha256'),'hex')
  for update;
  if not found or t.ticket_kind not in ('carona','combo') then raise exception 'Este ingresso não inclui Carona Radical.'; end if;
  if t.carona_redeemed_at is not null then raise exception 'Esta Carona já foi utilizada.'; end if;
  if t.status not in ('active','checked_in')
    or (not t.is_complimentary and not exists(
      select 1 from public.ticket_orders where id=t.order_id and status='paid'
    )) then raise exception 'A Carona exige um ingresso ativo.'; end if;
  update public.tickets set carona_redeemed_at=now(),carona_redeemed_by=auth.uid() where id=t.id;
  return public.admin_inspect_event_ticket(p_qr_token);
end $$;
revoke all on function only_ticket_internal.redeem_carona(text) from public,anon;
grant execute on function only_ticket_internal.redeem_carona(text) to authenticated;
