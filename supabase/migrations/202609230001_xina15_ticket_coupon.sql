-- Cupom XINA15 para o Only Cars Meeting 2026.
-- Sem limite global de resgates e sem prazo de expiracao definido.
-- O sistema existente aplica o desconto apenas a pedidos Expo e calcula
-- o valor final no servidor antes de enviar a preferencia ao Mercado Pago.
insert into public.ticket_purchase_coupons (
  event_id, code, description, discount_type, discount_value,
  max_redemptions, max_redemptions_per_user, starts_at, ends_at, active
)
select
  e.id, 'XINA15', '15% de desconto nos ingressos Expo',
  'percent', 15, null, 1000000, null, null, true
from public.events e
where e.slug = 'only-cars-meeting-2026'
on conflict (event_id, code) do update set
  description = excluded.description,
  discount_type = excluded.discount_type,
  discount_value = excluded.discount_value,
  max_redemptions = excluded.max_redemptions,
  max_redemptions_per_user = excluded.max_redemptions_per_user,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  active = excluded.active;
