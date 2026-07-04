# Slice 02 — Filling Templates in Configure

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 27, 28, 39

## What to build

Make **Filling Templates** a first-class, size-scoped selectable list in Configure, backed by BOM templates that contain only filling lines.

- Type or constrain BOM templates as filling-only (product type + size key).
- Configure UI: create, edit, activate/deactivate Filling Templates; lines must be filling-category items only.
- API/list for active Filling Templates filtered by product type and size (used later by assign UI).
- Deep module `filling-templates`: list + validate (reject non-filling lines).
- **Composed sellable** BOM remains the source of **packaging** and **protector** defaults by size×tier (pillow) or length (bolster). Tier (basic vs premium) is expressed by protector (and related non-filling defaults) on that composed sellable — not by customer preference.
- Live warehouse active BOM and **Apply template** remain separate and must keep working; this slice does not remove fillings from live warehouse BOM yet (sale-path cleanup in slice 12).

## Acceptance criteria

- [x] Operator can create a Filling Template for a given product type and size with only filling items.
- [x] Saving a template with a non-filling line is rejected.
- [x] Active Filling Templates are listable filtered by product type and size.
- [x] Inactive templates do not appear in the selectable list.
- [x] Configure still supports editing composed sellable non-filling defaults (packaging, protector) per size×tier / length.
- [x] Apply-to-active-BOM (warehouse) still works and is not broken by Filling Template typing.
- [x] `filling-templates` module has a behavior test for validate/list filtering.

## Status

**Done** on `cursor/domain-glossary-tier-result`.

- Migration `0043_filling_templates.sql`: `role` (`warehouse` | `filling`), `is_active`
- Module `lib/filling-templates` + tests
- Configure UI section + templates API (`role=filling`, validate filling-only lines)
- Apply rejects filling templates; warehouse templates unchanged (`role=warehouse`)

## Blocked by

- Slice 01 (glossary)
