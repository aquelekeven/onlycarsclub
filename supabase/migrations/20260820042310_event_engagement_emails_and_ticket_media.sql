alter table public.ticket_media add column if not exists submission_count smallint not null default 1;
alter table public.ticket_media add constraint ticket_media_submission_count_valid check (submission_count between 1 and 2);

create or replace function public.customer_submit_ticket_photo(p_ticket_id uuid,p_storage_path text,p_publication_consent boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.ticket_media; saved public.ticket_media;
begin
  if auth.uid() is null then raise exception 'Faça login para enviar a foto.'; end if;
  if not p_publication_consent then raise exception 'É necessário autorizar o uso da foto.'; end if;
  if p_storage_path !~ ('^'||auth.uid()::text||'/'||p_ticket_id::text||'/[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$') then raise exception 'Arquivo de foto inválido.'; end if;
  if not exists(select 1 from public.tickets t join public.ticket_orders o on o.id=t.order_id where t.id=p_ticket_id and t.owner_user_id=auth.uid() and o.user_id=auth.uid() and o.status='paid' and t.status in ('active','checked_in')) then raise exception 'O ingresso precisa estar pago e ativo.'; end if;
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

create table public.customer_cart_recovery (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email text not null,
  cart jsonb not null default '[]',
  item_count integer not null default 0 check(item_count>=0),
  updated_at timestamptz not null default now(),
  recovered_at timestamptz,
  last_email_at timestamptz
);
alter table public.customer_cart_recovery enable row level security;
revoke all on public.customer_cart_recovery from public,anon,authenticated;
grant select,insert,update,delete on public.customer_cart_recovery to service_role;

create or replace function public.sync_customer_cart_recovery(p_cart jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare item_total integer;
begin
  if auth.uid() is null then return; end if;
  select coalesce(sum(greatest(0,least(20,coalesce((x->>'quantity')::integer,0)))),0)::integer into item_total from jsonb_array_elements(coalesce(p_cart,'[]')) x;
  insert into public.customer_cart_recovery(user_id,email,cart,item_count,updated_at,recovered_at)
  select auth.uid(),u.email,coalesce(p_cart,'[]'),item_total,now(),case when item_total=0 then now() else null end from auth.users u where u.id=auth.uid()
  on conflict(user_id) do update set cart=excluded.cart,item_count=excluded.item_count,updated_at=now(),recovered_at=excluded.recovered_at;
end $$;
revoke all on function public.sync_customer_cart_recovery(jsonb) from public,anon;
grant execute on function public.sync_customer_cart_recovery(jsonb) to authenticated;

create table public.transactional_email_outbox (
 id bigint generated always as identity primary key,
 recipient_email text not null,
 recipient_name text,
 template text not null check(template in ('ticket_purchase','order_purchase','checkout_recovery','event_countdown')),
 subject text not null,
 payload jsonb not null default '{}',
 dedupe_key text not null unique,
 scheduled_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts smallint not null default 0,
 sent_at timestamptz,error_message text,provider_message_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index transactional_email_outbox_due_idx on public.transactional_email_outbox(scheduled_at,id) where status in ('pending','failed');
alter table public.transactional_email_outbox enable row level security;
revoke all on public.transactional_email_outbox from public,anon,authenticated;
grant select,insert,update on public.transactional_email_outbox to service_role;

create or replace function public.enqueue_only_emails()
returns integer language plpgsql security definer set search_path='' as $$
declare inserted_count integer:=0; n integer;
begin
  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'ticket_purchase','Seu ingresso para o Only Cars Meeting está confirmado',jsonb_build_object('order_id',o.id,'ticket_code',t.ticket_code,'qr_token',t.qr_token,'event_name',e.name,'event_date',e.starts_at,'vehicle_plate',t.vehicle_plate,'driver_name',t.driver_name,'total_cents',o.payable_cents),'ticket-paid:'||o.id
  from public.ticket_orders o join public.tickets t on t.order_id=o.id join public.events e on e.id=o.event_id where o.status='paid'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'order_purchase','Pedido '||o.order_number||' confirmado',jsonb_build_object('order_id',o.id,'order_number',o.order_number,'total_cents',o.total_cents),'order-paid:'||o.id
  from public.orders o where o.status='paid' on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'checkout_recovery','Seu ingresso ainda está esperando por você',jsonb_build_object('kind','ticket','order_id',o.id),'recover-ticket:'||o.id
  from public.ticket_orders o where o.status='pending_payment' and o.created_at<now()-interval '35 minutes' and o.created_at>now()-interval '3 days'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select o.customer_email,o.customer_name,'checkout_recovery','Seu carrinho Only ainda está esperando',jsonb_build_object('kind','order','order_id',o.id),'recover-order:'||o.id
  from public.orders o where o.status='pending_payment' and o.created_at<now()-interval '2 hours' and o.created_at>now()-interval '3 days'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select c.email,p.display_name,'checkout_recovery','Os produtos do seu carrinho continuam aqui',jsonb_build_object('kind','cart','cart',c.cart),'recover-cart:'||c.user_id||':'||to_char(c.updated_at,'YYYYMMDD')
  from public.customer_cart_recovery c join public.profiles p on p.id=c.user_id where c.item_count>0 and c.updated_at<now()-interval '2 hours' and c.updated_at>now()-interval '3 days'
  on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;

  insert into public.transactional_email_outbox(recipient_email,recipient_name,template,subject,payload,dedupe_key)
  select distinct o.customer_email,o.customer_name,'event_countdown','Faltam '||d.days||' dias para o Only Cars Meeting',jsonb_build_object('days',d.days,'event_name',e.name,'event_date',e.starts_at),'countdown:'||e.id||':'||d.days||':'||lower(o.customer_email)
  from public.events e join public.ticket_orders o on o.event_id=e.id and o.status='paid' cross join (values(10),(5),(1)) d(days)
  where (e.starts_at::date-current_date)=d.days on conflict(dedupe_key) do nothing; get diagnostics n=row_count; inserted_count:=inserted_count+n;
  return inserted_count;
end $$;
revoke all on function public.enqueue_only_emails() from public,anon,authenticated;
grant execute on function public.enqueue_only_emails() to service_role;

create or replace function public.admin_event_ticket_sales(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Acesso negado.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('ticket_id',t.id,'ticket_code',t.ticket_code,'ticket_status',t.status,'driver_name',t.driver_name,'driver_tax_id',t.driver_tax_id,'driver_phone',t.driver_phone,'vehicle_plate',t.vehicle_plate,'vehicle_make',t.vehicle_make,'vehicle_model',t.vehicle_model,'vehicle_year',t.vehicle_year,'instagram_handle',t.instagram_handle,'order_id',o.id,'customer_email',o.customer_email,'subtotal_cents',o.total_cents,'discount_cents',o.discount_cents,'total_cents',o.payable_cents,'coupon_code',o.coupon_code,'payment_method',o.payment_method,'paid_at',o.paid_at,'created_at',o.created_at,'photo',case when m.id is null then null else jsonb_build_object('storage_path',m.storage_path,'submission_count',m.submission_count,'status',m.status,'created_at',m.created_at) end) order by o.created_at desc) from public.tickets t join public.ticket_orders o on o.id=t.order_id left join public.ticket_media m on m.ticket_id=t.id where t.event_id=p_event_id and o.status='paid'),'[]');
end $$;
revoke all on function public.admin_event_ticket_sales(uuid) from public,anon;
grant execute on function public.admin_event_ticket_sales(uuid) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
