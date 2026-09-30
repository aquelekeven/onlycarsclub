-- Hide only explicitly archived cancelled tickets. Preserve auth guards and financial records.
CREATE OR REPLACE FUNCTION public.admin_event_gate_events()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when public.can_access_gate() then coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'starts_at', e.starts_at,
    'venue_name', e.venue_name,
    'status', e.status,
    'ticket_count', (select count(*) from public.tickets t where t.event_id = e.id and not (t.status = 'cancelled' and coalesce(t.metadata, '{}'::jsonb) ? 'site_archived_at'))
  ) order by e.starts_at desc), '[]'::jsonb) else '[]'::jsonb end
  from public.events e;
$function$;

CREATE OR REPLACE FUNCTION public.admin_event_ticket_sales(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where t.event_id=p_event_id and not (t.status = 'cancelled' and coalesce(t.metadata, '{}'::jsonb) ? 'site_archived_at')
      and (o.status='paid' or (t.is_complimentary and t.status in ('reserved','active','checked_in')))
  ),'[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_search_event_tickets(p_event_id uuid, p_query text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  search_text text := lower(trim(coalesce(p_query, '')));
  compact_search text := regexp_replace(lower(trim(coalesce(p_query, ''))), '[^a-z0-9]', '', 'g');
  result jsonb;
begin
  if not public.can_access_gate() then
    raise exception 'Acesso restrito à equipe da portaria.' using errcode = '42501';
  end if;

  if p_event_id is null then
    raise exception 'Selecione o evento antes de pesquisar.' using errcode = '22023';
  end if;

  if length(search_text) < 2 then
    raise exception 'Digite ao menos 2 caracteres para pesquisar.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(to_jsonb(item) - 'match_rank' order by item.match_rank, item.driver_name, item.ticket_code), '[]'::jsonb)
  into result
  from (
    select
      case
        when lower(t.ticket_code) = search_text then 0
        when lower(t.vehicle_plate) = search_text or regexp_replace(lower(t.vehicle_plate), '[^a-z0-9]', '', 'g') = compact_search then 1
        when lower(t.driver_name) = search_text then 2
        else 3
      end as match_rank,
      t.id,
      t.ticket_kind,
      t.carona_redeemed_at,
      t.ticket_code,
      t.status,
      t.event_id,
      e.name as event_name,
      t.driver_name,
      t.driver_phone,
      t.vehicle_plate,
      t.vehicle_make,
      t.vehicle_model,
      t.vehicle_year,
      t.is_complimentary,
      t.first_checked_in_at,
      t.last_entry_at,
      t.last_exit_at,
      t.qr_token
    from public.tickets t
    join public.events e on e.id = t.event_id
    where t.event_id = p_event_id and not (t.status = 'cancelled' and coalesce(t.metadata, '{}'::jsonb) ? 'site_archived_at')
      and (
        t.qr_token = trim(p_query)
        or lower(t.ticket_code) like '%' || search_text || '%'
        or lower(t.driver_name) like '%' || search_text || '%'
        or lower(t.driver_phone) like '%' || search_text || '%'
        or lower(t.vehicle_plate) like '%' || search_text || '%'
        or lower(t.vehicle_make) like '%' || search_text || '%'
        or lower(t.vehicle_model) like '%' || search_text || '%'
        or lower(coalesce(t.instagram_handle, '')) like '%' || search_text || '%'
        or (
          length(compact_search) >= 2
          and (
            regexp_replace(lower(t.ticket_code), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
            or regexp_replace(lower(t.driver_phone), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
            or regexp_replace(lower(t.vehicle_plate), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
            or regexp_replace(lower(t.driver_tax_id), '[^a-z0-9]', '', 'g') like '%' || compact_search || '%'
          )
        )
      )
    order by match_rank, t.driver_name, t.ticket_code
    limit 20
  ) item;

  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_event_tickets()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,'driver_name',t.driver_name,'ticket_kind',t.ticket_kind,
  'is_complimentary',t.is_complimentary,'courtesy_needs_details',coalesce((t.metadata->>'courtesy_needs_details')::boolean,false),
  'carona_redeemed_at',t.carona_redeemed_at,'vehicle_plate',case when t.is_complimentary and t.status='reserved' then '' else t.vehicle_plate end,
  'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,'instagram_handle',t.instagram_handle,
  'qr_token',case when (t.is_complimentary or o.status='paid') and t.status in ('active','checked_in') then t.qr_token else null end,
  'order_id',o.id,'order_status',case when t.is_complimentary then 'complimentary' else o.status::text end,
  'payment_status',case when t.is_complimentary then 'free' else o.payment_status::text end,
  'total_cents',case when t.is_complimentary then 0 else coalesce(t.face_price_cents,o.unit_price_cents)-round(o.discount_cents::numeric/o.quantity)::integer end,
  'subtotal_cents',case when t.is_complimentary then 0 else coalesce(t.face_price_cents,o.unit_price_cents) end,
  'discount_cents',case when t.is_complimentary then 0 else round(o.discount_cents::numeric/o.quantity)::integer end,
  'order_total_cents',case when t.is_complimentary then 0 else o.payable_cents end,
  'order_quantity',case when t.is_complimentary then 1 else o.quantity end,'coupon_code',o.coupon_code,
  'expires_at',o.expires_at,'created_at',t.created_at,'is_test',p.is_test,'event_id',e.id,'event_name',e.name,
  'event_starts_at',e.starts_at,'venue_name',e.venue_name,'age_rating',e.age_rating,'lot_name',l.name,
  'refund_request',case when r.id is null then null else jsonb_build_object('id',r.id,'status',r.status,'reason',r.reason,'details',r.details,'admin_notes',r.admin_notes,'created_at',r.created_at,'updated_at',r.updated_at) end
 ) order by e.starts_at desc,coalesce(o.created_at,t.created_at) desc,t.created_at),'[]'::jsonb)
 from public.tickets t join public.profiles p on p.id=t.owner_user_id join public.events e on e.id=t.event_id
 left join public.ticket_orders o on o.id=t.order_id left join public.event_lots l on l.id=o.lot_id
 left join public.ticket_refund_requests r on r.ticket_order_id=o.id
 where t.owner_user_id=auth.uid() and not (t.status = 'cancelled' and coalesce(t.metadata, '{}'::jsonb) ? 'site_archived_at') and (t.is_complimentary or o.user_id=auth.uid());
$function$;
