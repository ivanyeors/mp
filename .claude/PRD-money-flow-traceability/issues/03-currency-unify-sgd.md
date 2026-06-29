# Slice 03 — Unify currency on SGD

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 1, 2, 3

## What to build

Make SGD the single currency across the money pipeline, end to end (migration + display).

- Migration: set `'SGD'` defaults and migrate existing rows on `item_prices`, `product_prices`, `product_variants`, `shipping_methods`, `coupons`, and legacy Shopify overrides. Treat as a relabel unless the user confirms a one-time FX multiply is needed for genuinely-USD values.
- Add a single `formatCurrency(amount, 'SGD')` helper and replace hardcoded `USD`/`RM` labels (products list price range, discount editor, anywhere else surfaced).

## Acceptance criteria

- [x] All listed tables default to and store SGD; no remaining MYR/USD currency values after migration. (Migration `20260630000000_unify_currency_sgd.sql` covers `item_prices`/`product_prices`/`shopify_variant_overrides`; the MYR tables were already done by `0031_fix_currency_sgd.sql`.)
- [x] Product list, discount editor, order screens, and emails display SGD via the shared `formatCurrency` helper (`lib/i18n/currencies.ts`). All local `formatPrice`/`formatMoney`/`formatSGD`/`formatOrderPrice` helpers now delegate to it.
- [x] No hardcoded `RM` or `USD` currency strings remain in the surfaced UI (products list, discount editor + list, shipping, orders, analytics charts, shop fallbacks). The discount editor's MYR/USD currency picker was removed (unified on SGD).
- [x] Migration is reversible/documented; FX-vs-relabel decision recorded (relabel — see migration header and note below).
- [ ] Existing checkout/orders continue to function with SGD totals. (Verified by type-check + unit tests; needs a manual smoke test after the migration is applied with `pnpm db:push`.)

## Decision: relabel, not FX

Per the PRD, the `USD`/`MYR` currency labels were placeholder defaults, not genuine foreign-currency amounts, so the migration treats stored numbers as already being SGD and only flips the labels/defaults. No amounts are mutated, so it is information-preserving and reversible (down steps are in the migration footer). If any of these columns ever hold real USD values, run a separate audited FX multiply before relying on them.

## Apply note

Migration is on disk only. Apply with `pnpm db:push` against the **mp** Supabase project. NOTE: the currently-linked `user-supabase` MCP points at a different (personal-finance) project, so do not apply via MCP.

## Blocked by

None - can start immediately.
