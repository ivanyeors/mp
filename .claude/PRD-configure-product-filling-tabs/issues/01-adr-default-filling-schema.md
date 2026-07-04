# Slice 01 — ADR + default filling schema + validation module

Type: AFK
Parent: PRD `configure-product-filling-tabs` (`.claude/PRD-configure-product-filling-tabs/configure-product-filling-tabs-prd.md`)
Triage: needs-triage
User stories covered: 20, 21

## What to build

Land the architectural decision and database support for per-product-card **Default Filling Templates**.

- ADR `docs/adr/0003-fillings-only-in-filling-templates.md` (accepted).
- Migration: `pillow_products.default_filling_template_id` (nullable FK → `bom_templates`, ON DELETE SET NULL).
- Migration: `bolster_length_config` table (`variant` PK, `default_filling_template_id` FK) — one row per short/medium/long.
- Extend **`filling-templates`** with `validateDefaultFillingTemplate(template, productCard)` — enforces `role=filling`, matching `kind`+`key`, `is_active=true`.
- API helper to read/write default id for a composed sellable key (pillow size×tier, bolster length).

## Acceptance criteria

- [ ] ADR 0003 present and referenced from PRD.
- [ ] Migration applies cleanly; nullable defaults; bolster length config seeded with three rows.
- [ ] `validateDefaultFillingTemplate` rejects wrong role, inactive, or kind/key mismatch.
- [ ] `validateDefaultFillingTemplate` accepts a valid active filling template for the product card scope.
- [ ] Behavior tests in `lib/filling-templates` (or colocated `__tests__`).

## Blocked by

None — can start immediately.
