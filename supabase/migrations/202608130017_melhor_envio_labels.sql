-- Only Cars Club — ciclo seguro e auditável das etiquetas do Melhor Envio.

alter table public.shipments
  add column if not exists cart_item_id text,
  add column if not exists checkout_completed_at timestamptz,
  add column if not exists generated_at timestamptz,
  add column if not exists label_expires_at timestamptz,
  add column if not exists last_error text,
  add column if not exists provider_payload jsonb not null default '{}'::jsonb;

create unique index if not exists shipments_provider_order_unique
  on public.shipments(provider, provider_order_id)
  where provider_order_id is not null;

create unique index if not exists shipments_cart_item_unique
  on public.shipments(provider, cart_item_id)
  where cart_item_id is not null;

comment on column public.shipments.cart_item_id is
  'ID devolvido por POST /api/v2/me/cart; utilizado no checkout, geração e impressão.';
comment on column public.shipments.checkout_completed_at is
  'Momento em que a compra da etiqueta foi confirmada e cobrada pelo Melhor Envio.';
comment on column public.shipments.generated_at is
  'Momento em que a etiqueta comprada foi efetivamente gerada.';
comment on column public.shipments.label_expires_at is
  'Validade operacional da etiqueta, atualmente 20 dias após a geração.';
comment on column public.shipments.provider_payload is
  'Metadados não sensíveis retornados pelo provedor para suporte e retomada idempotente.';

-- Toda mutação continua exclusiva do backend/service role. Administradores
-- podem consultar o estado pelo relacionamento já protegido por RLS.
revoke insert, update, delete on public.shipments from authenticated;

