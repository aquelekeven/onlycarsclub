-- Configuração provisória de frete para copo térmico e chaveiros.
-- Adesivos permanecem sem peso/dimensões e, portanto, somente para retirada.

update public.products
set metadata =
  (coalesce(metadata, '{}'::jsonb) - 'shipping_data_pending')
  || jsonb_build_object('pickup_only', false)
where slug in (
  'copo-termico',
  'chaveiro-logotipo',
  'chaveiro-onlynho-1',
  'chaveiro-onlynho-2'
);

update public.product_variants pv
set
  weight_grams = case
    when p.slug = 'copo-termico' then 400
    else 50
  end,
  length_cm = 30,
  width_cm = 20,
  height_cm = 8,
  metadata = coalesce(pv.metadata, '{}'::jsonb) - 'shipping_data_pending'
from public.products p
where p.id = pv.product_id
  and p.slug in (
    'copo-termico',
    'chaveiro-logotipo',
    'chaveiro-onlynho-1',
    'chaveiro-onlynho-2'
  );

update public.products
set metadata =
  coalesce(metadata, '{}'::jsonb)
  || jsonb_build_object('pickup_only', true, 'pickup_event_only', true)
where slug in (
  'adesivo-japones-p',
  'adesivo-japones-m',
  'adesivo-japones-g',
  'adesivo-mascote'
);
