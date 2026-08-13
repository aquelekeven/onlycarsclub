-- Ano e cor não fazem parte do cadastro do ingresso Expo.
alter table public.tickets
  alter column vehicle_color drop not null;
