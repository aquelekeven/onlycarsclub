-- Only Cars Club — preços finais do evento e dados físicos do catálogo.
update public.event_lots as lot set
  name = case lot.lot_number when 1 then 'Lote 1' when 2 then 'Lote 2' when 3 then 'Último lote e porta' end,
  price_cents = case lot.lot_number when 1 then 3500 when 2 then 4500 when 3 then 6000 end,
  updated_at = now()
from public.events as event
where event.id=lot.event_id and event.slug='only-cars-meeting-2026' and lot.lot_number in (1,2,3);

update public.product_variants v set
  weight_grams = case
    when p.slug in ('camiseta-oversized','camiseta-oversized-amarela') then 320
    when p.slug='camiseta-streetwear' then 250
    when p.slug='moletom' then 600
    when p.slug='cropped' then 200
    else v.weight_grams end,
  length_cm=30,width_cm=20,height_cm=8,updated_at=now()
from public.products p
where p.id=v.product_id and p.slug in ('camiseta-oversized','camiseta-oversized-amarela','camiseta-streetwear','moletom','cropped');

update public.product_variants v set
  weight_grams=case p.slug when 'adesivo-japones-p' then 10 when 'adesivo-japones-m' then 15 when 'adesivo-japones-g' then 25 else 10 end,
  length_cm=case p.slug when 'adesivo-japones-p' then 15 when 'adesivo-japones-m' then 31 when 'adesivo-japones-g' then 53 else 15 end,
  width_cm=case p.slug when 'adesivo-japones-p' then 3.5 when 'adesivo-japones-m' then 7 when 'adesivo-japones-g' then 11 else 10 end,
  height_cm=.2,updated_at=now()
from public.products p
where p.id=v.product_id and p.slug in ('adesivo-japones-p','adesivo-japones-m','adesivo-japones-g','adesivo-mascote');
