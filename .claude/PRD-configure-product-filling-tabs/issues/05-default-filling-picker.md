# Slice 05 — Default Filling Template picker on Product tab

Type: AFK
Parent: PRD `configure-product-filling-tabs` (`.claude/PRD-configure-product-filling-tabs/configure-product-filling-tabs-prd.md`)
Triage: needs-triage
User stories covered: 4, 24, 28

## What to build

Per product card **Default Filling Template** on the **Product** tab, persisted to the database.

- **Product tab** dropdown: active filling templates for this card's product type + size/length (catalog may include mixes created on Filling Config tab).
- Save product card persists `default_filling_template_id` on `pillow_products` or `bolster_length_config` via API (validated with `validateDefaultFillingTemplate`).
- Load drawer: pre-select current default from DB.
- Show compact **filling-preview** (variant, qty) for selected default on Product tab (reuse module from slice 06 or implement here first).
- Empty state copy when no default set: "No default configured".

## Acceptance criteria

- [ ] Basic Size S and Premium Size S can have different defaults saved independently.
- [ ] Each bolster length can have its own default saved.
- [ ] Saving an invalid default (wrong size, inactive, warehouse role) is rejected.
- [ ] Default survives page reload (read from DB).
- [ ] Clearing default (nullable) is supported.
- [ ] `filling-preview` module has behavior test for variant/qty output.

## Blocked by

- Slice 01 (schema + validation)
- Slice 04 (Product tab exists)
