-- Encerra automaticamente a promoção de lançamento às 00:00 de 28/08/2026
-- no horário de Brasília (03:00 UTC), restaurando os preços originais.
select cron.schedule(
  'end_only_launch_promotion_2026',
  '0 3 28 8 *',
  $cron$
    update public.product_variants
       set price_cents = compare_at_price_cents,
           compare_at_price_cents = null,
           updated_at = now()
     where compare_at_price_cents is not null
       and now() >= timestamptz '2026-08-28 03:00:00+00'
       and now() < timestamptz '2026-08-29 03:00:00+00';
  $cron$
);
