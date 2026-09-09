# Pending ticket modalities release

This SQL is reviewed and tested, but has NOT been applied. Automatic approval review rejected the live migration because it changes production order/ticket schema, pricing, inventory and authorization, and enables Carona sales. Explicit user authorization for that exact rollout is required before retrying.

The existing 17 orders (R$ 441.00 aggregate total/payable at review time) are preserved by nullable subtotal/inventory overrides. The rollback-only tests passed against the actual schema without creating real purchases.

After authorization:
1. Recheck deployed code/schema for intervening changes and rerun the rollback-only validation if needed.
2. Apply this SQL with Supabase migration tooling. Use the actual returned migration version to move this file into `supabase/migrations/`.
3. Run security advisors and verify legacy totals and public event summary.
4. Deploy `mercado-pago-ingresso` and `process-only-emails`, preserving `verify_jwt: true` and existing secrets.
5. Merge the corresponding frontend PR, then verify the published routes.

The purchase Edge Function uses `service_reserve_typed_tickets`, which is service-role-only. The new admin redemption implementation is in a private schema and checks the authenticated administrator. Existing Expo orders retain their behavior. Carona does not consume Expo capacity; combo consumes one Expo place and one independently redeemable ride. Carona price is R$ 180. Combo price is 90% of the active Expo lot price plus R$ 180. Existing coupons remain scoped to Expo-only orders.

Validation commands:
- `node tests/ticket-modalities.cjs`
- SQL: apply the candidate schema in a transaction, run the body of `tests/ticket-modalities-rollback.sql`, then roll back. Never commit QA fixture writes.
