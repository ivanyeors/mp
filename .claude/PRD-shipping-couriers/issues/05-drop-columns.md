# 05 — Drop dead columns

Type: AFK · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

Remove the storage that 02-04 made obsolete, so the schema and types describe one shipping model: methods, plus one courier account that holds the sender address and boxes.

The docs half (`CONTEXT.md`, `docs/easyship-setup.md`, the easyship skill) shipped with 01-04 on `feat/shipping-couriers`; it needed no deploy.

Notes:
- Migration: `alter table shipping_settings drop column easyship_enabled, drop column origin_address, drop column packages`. Trim `parseShippingSettings`, `DEFAULT_SHIPPING_SETTINGS` and `lib/shipping/types.ts`.

## Acceptance criteria

- [x] The migration drops the three columns. Build, tests and `bundle:check` are green.
- [x] `grep -rn "origin_address\|easyship_enabled" lib app` finds only the doc schema.

## Blocked by

- 02, 03 and 04, all deployed. The columns are read until then.
