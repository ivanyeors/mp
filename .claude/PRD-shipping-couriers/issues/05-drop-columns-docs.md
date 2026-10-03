# 05 — Drop dead columns + docs

Type: AFK · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

Remove the storage and vocabulary that 02-04 made obsolete. The schema, types, glossary and setup docs then describe one shipping model: methods, plus one courier account that holds the sender address and boxes.

Notes:
- Migration: `alter table shipping_settings drop column easyship_enabled, drop column origin_address, drop column packages`. Trim `parseShippingSettings`, `DEFAULT_SHIPPING_SETTINGS` and `lib/shipping/types.ts`.
- `CONTEXT.md` Shipping section (L364-394):
  - Remove **Fallback rate**.
  - Rewrite **Package profile** as "a box per item type".
  - Add **Courier account**.
  - Fix the "Settings → Shipping → Easyship" paths.
- `docs/easyship-setup.md`: new paths. `.claude/skills/easyship/SKILL.md`: add `box_for_type`, and say the sender address drives rating.

## Acceptance criteria

- [ ] The migration drops the three columns. Build, tests and `bundle:check` are green.
- [ ] `grep -rn "origin_address\|easyship_enabled" lib app` finds only the doc schema.
- [ ] `CONTEXT.md` has no "Fallback rate" and defines "Courier account".
- [ ] The setup doc and skill point at Shipping › Couriers.

## Blocked by

- 02, 03 and 04, all deployed. The columns are read until then.
