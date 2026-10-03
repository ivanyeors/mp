# 06 — Prod sign-off

Type: HITL · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

A person verifies the merged shipping surface against live prod: real courier account, real checkout, real label, real handset.

## Acceptance criteria

- [ ] Migrations are applied by hand (`supabase db push`) in the deploy sitting.
- [ ] Couriers: Import from courier account, review, then Save & sync. The sync report is clean.
- [ ] The old `/settings/integrations/easyship` bookmark redirects.
- [ ] Checkout with an SG address shows a live method with a courier price.
- [ ] On a preview with the token unset, only flat methods show, and none is labelled fallback.
- [ ] A label can be bought from an order.
- [ ] Handset pass of Shipping and Couriers.

## Blocked by

- 05
