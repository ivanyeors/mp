# Slice 03 — Migrate legacy BOM fillings to Filling Templates

Type: AFK
Parent: PRD `configure-product-filling-tabs` (`.claude/PRD-configure-product-filling-tabs/configure-product-filling-tabs-prd.md`)
Triage: needs-triage
User stories covered: 17, 18

## What to build

One-time **C then A** migration: seed Filling Templates from existing composed sellable filling lines, set defaults, delete raw filling BOM rows.

- For each active `pillow_products` row: if `bom_lines` include filling-category items, create `bom_templates` (`role=filling`, `kind=pillow`, `key=size`) named `{size} - {tier} - default`, copy lines to `bom_template_lines`, set `pillow_products.default_filling_template_id`, `is_active=true`.
- For each bolster length (short/medium/long): same pattern, name `{length} - default`, set `bolster_length_config.default_filling_template_id`.
- Skip if a filling template with that name already exists for kind+key (idempotent).
- Delete all `bom_lines` / `bolster_bom_lines` rows whose item category is `filling`.
- Post-migration verification query or test script.

## Acceptance criteria

- [ ] After migration, no `bom_lines` / `bolster_bom_lines` rows reference filling-category items.
- [ ] Each product card that had filling lines has an active seeded template and `default_filling_template_id` set.
- [ ] Seeded template names follow `{size} - {tier} - default` (pillow) and `{length} - default` (bolster).
- [ ] Re-running migration does not duplicate templates or break existing defaults.
- [ ] Verification test or documented SQL check passes in CI/dev.

## Blocked by

- Slice 01 (default FK columns exist)
- Slice 02 (save paths strip fillings so migration isn't immediately undone)
