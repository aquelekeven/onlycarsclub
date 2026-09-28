-- Invite records are private until the intended recipient verifies the exact email.
create table public.event_courtesy_invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  email text not null,
  recipient_name text not null,
  partner_name text,
  ticket_kind text not null default 'expo' check (ticket_kind in ('expo','carona','combo')),
  quantity integer not null check (quantity between 1 and 10),
  status text not null default 'pending' check (status in ('pending','claimed','cancelled')),
  created_by uuid not null references public.profiles(id),
  claimed_by uuid references public.profiles(id),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint courtesy_invite_normalized_email check (email = lower(btrim(email)))
);
create unique index event_courtesy_invites_one_email on public.event_courtesy_invites(event_id,email) where status <> 'cancelled';
create index event_courtesy_invites_pending_email on public.event_courtesy_invites(email) where status='pending';
alter table public.event_courtesy_invites enable row level security;
revoke all on public.event_courtesy_invites from public,anon,authenticated;
grant select,insert,update on public.event_courtesy_invites to service_role;
create schema if not exists only_courtesy_internal;
revoke all on schema only_courtesy_internal from public;
grant usage on schema only_courtesy_internal to authenticated;

create function only_courtesy_internal.save_invite(p_event_id uuid,p_id uuid,p_email text,p_name text,p_quantity integer,p_ticket_kind text,p_partner text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; recipient text:=lower(btrim(coalesce(p_email,''))); saved public.event_courtesy_invites%rowtype; booked integer;
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito aos administradores.' using errcode='42501'; end if;
 if recipient !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(recipient)>254 then raise exception 'Informe um e-mail válido.'; end if;
 if length(btrim(coalesce(p_name,'')))<2 or length(p_name)>120 then raise exception 'Informe o nome do convidado.'; end if;
 if p_quantity not between 1 and 10 or p_ticket_kind not in ('expo','carona','combo') then raise exception 'Modalidade ou quantidade inválida.'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento não encontrado.'; end if;
 if p_id is not null and not exists(select 1 from public.event_courtesy_invites where id=p_id and event_id=e.id and status='pending') then raise exception 'Somente convites pendentes podem ser editados.'; end if;
 select coalesce(sum(quantity),0) into booked from public.event_courtesy_invites where event_id=e.id and status in ('pending','claimed') and id is distinct from p_id;
 if booked + p_quantity > e.complimentary_capacity then raise exception 'Restam % vagas de cortesia neste evento.',greatest(e.complimentary_capacity-booked,0); end if;
 if p_id is null then
  insert into public.event_courtesy_invites(event_id,email,recipient_name,partner_name,quantity,ticket_kind,created_by)
  values(e.id,recipient,btrim(p_name),nullif(left(btrim(p_partner),80),''),p_quantity,p_ticket_kind,auth.uid()) returning * into saved;
 else
  update public.event_courtesy_invites set email=recipient,recipient_name=btrim(p_name),partner_name=nullif(left(btrim(p_partner),80),''),quantity=p_quantity,ticket_kind=p_ticket_kind,updated_at=now()
  where id=p_id and event_id=e.id and status='pending' returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'email',saved.email,'status',saved.status);
end $$;

create function only_courtesy_internal.list_invites(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito aos administradores.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'recipient_name',i.recipient_name,'partner_name',i.partner_name,'quantity',i.quantity,'ticket_kind',i.ticket_kind,'status',i.status,'created_at',i.created_at,'claimed_at',i.claimed_at) order by i.created_at desc) from public.event_courtesy_invites i where i.event_id=p_event_id),'[]'::jsonb);
end $$;

create function only_courtesy_internal.cancel_invite(p_event_id uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Acesso restrito aos administradores.' using errcode='42501'; end if;
 perform 1 from public.events where id=p_event_id for update;
 update public.event_courtesy_invites set status='cancelled',updated_at=now() where id=p_id and event_id=p_event_id and status='pending';
 if not found then raise exception 'Somente convites ainda não resgatados podem ser cancelados.'; end if;
 return true;
end $$;

create function only_courtesy_internal.claim_invites()
returns integer language plpgsql security definer set search_path='' as $$
declare recipient auth.users%rowtype; invite public.event_courtesy_invites%rowtype; e public.events%rowtype; token text; n integer:=0; i integer;
begin
 if auth.uid() is null then raise exception 'Faça login para ver seus convites.' using errcode='42501'; end if;
 select * into recipient from auth.users where id=auth.uid();
 if recipient.email_confirmed_at is null or recipient.email is null then return 0; end if;
 for invite in select * from public.event_courtesy_invites where email=lower(btrim(recipient.email)) and status='pending' order by created_at loop
  select * into e from public.events where id=invite.event_id for update;
  select * into invite from public.event_courtesy_invites where id=invite.id and email=lower(btrim(recipient.email)) and status='pending' for update;
  if not found then continue; end if;
  if e.ends_at <= now() then continue; end if;
  for i in 1..invite.quantity loop
   token:=gen_random_uuid()::text||gen_random_uuid()::text;
   insert into public.tickets(event_id,owner_user_id,qr_token,qr_token_hash,status,is_complimentary,complimentary_issued_by,driver_name,driver_tax_id,driver_phone,vehicle_plate,vehicle_make,vehicle_model,ticket_kind,face_price_cents,metadata)
   values(e.id,recipient.id,token,encode(extensions.digest(convert_to(token,'UTF8'),'sha256'),'hex'),'reserved',true,invite.created_by,invite.recipient_name,'','',case when invite.ticket_kind='carona' then '' else 'CT'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,5)) end,'','',invite.ticket_kind,0,jsonb_build_object('courtesy_invite_id',invite.id,'courtesy_needs_details',true));
   n:=n+1;
  end loop;
  update public.event_courtesy_invites set status='claimed',claimed_by=recipient.id,claimed_at=now(),updated_at=now() where id=invite.id;
 end loop;
 return n;
end $$;

create function only_courtesy_internal.complete_ticket(p_ticket_id uuid,p_name text,p_tax_id text,p_phone text,p_plate text,p_make text,p_model text)
returns boolean language plpgsql security definer set search_path='' as $$
declare t public.tickets%rowtype; plate text:=upper(regexp_replace(coalesce(p_plate,''),'[^A-Za-z0-9]','','g'));
begin
 if auth.uid() is null then raise exception 'Faça login.' using errcode='42501'; end if;
 select * into t from public.tickets where id=p_ticket_id and owner_user_id=auth.uid() and is_complimentary and status='reserved' and metadata ? 'courtesy_invite_id' for update;
 if not found then raise exception 'Cortesia não encontrada ou já concluída.'; end if;
 if length(btrim(coalesce(p_name,'')))<2 or coalesce(p_tax_id,'') !~ '^[0-9]{11}$' or coalesce(p_phone,'') !~ '^[0-9]{10,11}$' then raise exception 'Confira nome, CPF e WhatsApp do titular.'; end if;
 if t.ticket_kind in ('expo','combo') and (plate !~ '^[A-Z0-9]{7}$' or length(btrim(coalesce(p_make,'')))<2 or length(btrim(coalesce(p_model,'')))<1) then raise exception 'Confira a placa, marca e modelo do veículo.'; end if;
 if t.ticket_kind in ('expo','combo') and exists(select 1 from public.tickets x where x.event_id=t.event_id and x.id<>t.id and x.ticket_kind in ('expo','combo') and x.status in ('reserved','active','checked_in') and x.vehicle_plate=plate) then raise exception 'Esta placa já está vinculada a outro ingresso.'; end if;
 update public.tickets set driver_name=btrim(p_name),driver_tax_id=p_tax_id,driver_phone=p_phone,
  vehicle_plate=case when t.ticket_kind='carona' then '' else plate end,
  vehicle_make=case when t.ticket_kind='carona' then '' else btrim(p_make) end,
  vehicle_model=case when t.ticket_kind='carona' then '' else btrim(p_model) end,
  metadata=metadata || '{"courtesy_needs_details":false}'::jsonb,status='active',updated_at=now() where id=t.id;
 return true;
end $$;

create function public.admin_save_courtesy_invite(p_event_id uuid,p_id uuid,p_email text,p_name text,p_quantity integer,p_ticket_kind text,p_partner text)
returns jsonb language sql security invoker set search_path='' as $$select only_courtesy_internal.save_invite(p_event_id,p_id,p_email,p_name,p_quantity,p_ticket_kind,p_partner)$$;
create function public.admin_list_courtesy_invites(p_event_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$select only_courtesy_internal.list_invites(p_event_id)$$;
create function public.admin_cancel_courtesy_invite(p_event_id uuid,p_id uuid)
returns boolean language sql security invoker set search_path='' as $$select only_courtesy_internal.cancel_invite(p_event_id,p_id)$$;
create function public.customer_claim_courtesy_invites()
returns integer language sql security invoker set search_path='' as $$select only_courtesy_internal.claim_invites()$$;
create function public.customer_complete_courtesy_ticket(p_ticket_id uuid,p_name text,p_tax_id text,p_phone text,p_plate text,p_make text,p_model text)
returns boolean language sql security invoker set search_path='' as $$select only_courtesy_internal.complete_ticket(p_ticket_id,p_name,p_tax_id,p_phone,p_plate,p_make,p_model)$$;
revoke all on all functions in schema only_courtesy_internal from public,anon,authenticated;
grant execute on function only_courtesy_internal.save_invite(uuid,uuid,text,text,integer,text,text),only_courtesy_internal.list_invites(uuid),only_courtesy_internal.cancel_invite(uuid,uuid),only_courtesy_internal.claim_invites(),only_courtesy_internal.complete_ticket(uuid,text,text,text,text,text,text) to authenticated;
revoke all on function public.admin_save_courtesy_invite(uuid,uuid,text,text,integer,text,text),public.admin_list_courtesy_invites(uuid),public.admin_cancel_courtesy_invite(uuid,uuid),public.customer_claim_courtesy_invites(),public.customer_complete_courtesy_ticket(uuid,text,text,text,text,text,text) from public,anon;
grant execute on function public.admin_save_courtesy_invite(uuid,uuid,text,text,integer,text,text),public.admin_list_courtesy_invites(uuid),public.admin_cancel_courtesy_invite(uuid,uuid),public.customer_claim_courtesy_invites(),public.customer_complete_courtesy_ticket(uuid,text,text,text,text,text,text) to authenticated;

create or replace function public.customer_event_tickets()
returns jsonb language sql stable security definer set search_path='' as $$
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
 where t.owner_user_id=auth.uid() and (t.is_complimentary or o.user_id=auth.uid());
$$;
revoke all on function public.customer_event_tickets() from public,anon;
grant execute on function public.customer_event_tickets() to authenticated;

-- Confirmed Expo/Combo cortesias may submit the same post photo as paid tickets.
create or replace function public.customer_submit_ticket_photo(p_ticket_id uuid,p_storage_path text,p_publication_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.ticket_media; saved public.ticket_media;
begin
 if auth.uid() is null then raise exception 'Faça login para enviar a foto.'; end if;
 if not p_publication_consent then raise exception 'É necessário autorizar o uso da foto.'; end if;
 if p_storage_path !~ ('^'||auth.uid()::text||'/'||p_ticket_id::text||'/[A-Za-z0-9-]+[.](jpg|jpeg|png|webp)$') then raise exception 'Arquivo de foto inválido.'; end if;
 if not exists(select 1 from public.tickets t left join public.ticket_orders o on o.id=t.order_id
   where t.id=p_ticket_id and t.owner_user_id=auth.uid() and t.ticket_kind in ('expo','combo')
   and (t.is_complimentary or (o.user_id=auth.uid() and o.status='paid'))
   and t.status in ('active','checked_in')) then raise exception 'O ingresso precisa estar ativo.'; end if;
 select * into existing from public.ticket_media where ticket_id=p_ticket_id for update;
 if existing.id is null then
  insert into public.ticket_media(ticket_id,owner_user_id,storage_path,publication_consent,publication_consent_at,status,submission_count)
  values(p_ticket_id,auth.uid(),p_storage_path,true,now(),'pending',1) returning * into saved;
 else
  if existing.submission_count >= 2 then raise exception 'Você atingiu o limite de 2 fotos para este ingresso.'; end if;
  update public.ticket_media set storage_path=p_storage_path,publication_consent=true,publication_consent_at=now(),status='pending',submission_count=submission_count+1,updated_at=now() where id=existing.id returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'submission_count',saved.submission_count,'remaining',2-saved.submission_count);
end $$;
revoke all on function public.customer_submit_ticket_photo(uuid,text,boolean) from public,anon;
grant execute on function public.customer_submit_ticket_photo(uuid,text,boolean) to authenticated;
