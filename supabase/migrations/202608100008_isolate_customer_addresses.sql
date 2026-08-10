-- Endereços são dados pessoais e nunca devem ser legíveis por outro usuário,
-- nem mesmo quando esse usuário também possui papel administrativo.

drop policy if exists "addresses_manage_own_or_admin" on public.addresses;
drop policy if exists "addresses_manage_own" on public.addresses;

create policy "addresses_manage_own"
on public.addresses
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
