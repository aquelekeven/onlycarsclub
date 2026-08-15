-- Valores aprovados para o Only Cars Meeting 2026.
update public.event_lots as lot
set price_cents = case lot.lot_number
  when 1 then 4500
  when 2 then 6000
  when 3 then 8000
end,
updated_at = now()
from public.events as event
where event.id = lot.event_id
  and event.slug = 'only-cars-meeting-2026'
  and lot.lot_number in (1, 2, 3);

select
  lot.lot_number,
  lot.name,
  lot.price_cents,
  lot.active
from public.event_lots as lot
join public.events as event on event.id = lot.event_id
where event.slug = 'only-cars-meeting-2026'
order by lot.lot_number;
