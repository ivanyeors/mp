# 06 — Prod sign-off

Type: HITL · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

A person verifies the merged shipping surface against live prod: real courier account, real checkout, real label, real handset.

## Acceptance criteria

- [ ] **Rollout order, strictly:** (1) on the current prod code, Integrations › Easyship → Import → Save & sync, so the courier doc has `settings` with the live sender and boxes; (2) `supabase db push` the three `2026100312*` migrations; (3) merge/deploy; (4) Couriers → Save & sync to push the seeded boxes. Skipping (1) makes both seeds no-ops and hides every live method at checkout.
- [ ] Before (2), read-only check: `select config ? 'settings', jsonb_array_length(config->'settings'->'addresses') from api_configs where slug = 'easyship'`.
- [ ] After (3), every active live method has a non-zero customisation order rate (Results still charge it).
- [ ] Couriers: Import from courier account, review, then Save & sync. The sync report is clean.
- [ ] The old `/settings/integrations/easyship` bookmark redirects.
- [ ] Checkout with an SG address shows a live method with a courier price.
- [ ] On a preview with the token unset, only flat methods show, and none is labelled fallback.
- [ ] A label can be bought from an order.
- [ ] Handset pass of Shipping and Couriers.

## Blocked by

- 05
