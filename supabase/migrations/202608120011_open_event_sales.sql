-- Execute somente quando a função mercado-pago-ingresso estiver publicada e testada.
update public.events
set status = 'sales_open', sales_start_at = coalesce(sales_start_at, now()), updated_at = now()
where slug = 'only-cars-meeting-2026';

update public.event_lots l
set active = (l.lot_number = 1), updated_at = now()
from public.events e
where e.id = l.event_id and e.slug = 'only-cars-meeting-2026';
