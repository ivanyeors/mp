# Slice 04 — Configure drawer tabs (Product / Filling Config)

Type: AFK
Parent: PRD `configure-product-filling-tabs` (`.claude/PRD-configure-product-filling-tabs/configure-product-filling-tabs-prd.md`)
Triage: needs-triage
User stories covered: 1, 2, 3, 5, 6, 23, 25, 26

## What to build

Refactor Configure product drawers to the grilled UX; all template operations sync to the database.

- Each pillow (basic/premium) and bolster length **Sheet** gets tabs: **Product** | **Filling Config**.
- **Product tab:** non-filling editors only — remove `Fillings` section from `SizeEditor` / bolster editor; keep warehouse template load/save/apply UI.
- **Filling Config tab:** move catalog CRUD from page-bottom section into drawer; scoped to that drawer's product type + size/length only (pillow basic Size S does not show bolster mixes).
- Remove standalone **Filling Templates** section at bottom of Configure page.
- All template create/update/delete/active flag persists via `bom_templates` + `bom_template_lines` API (no local-only authoritative state; remove bolster `localStorage` BOM cache if still used as source of truth).
- Filling Config: create, edit, activate/deactivate, delete mixes; lines filling-category only.

## Acceptance criteria

- [ ] Opening Basic Size S shows **Product** and **Filling Config** tabs; bolster length drawers match.
- [ ] Product tab has no raw filling line editor.
- [ ] Filling Config tab lists/creates/edits templates only for that drawer’s product type and size/length.
- [ ] Page-bottom Filling Templates section removed.
- [ ] Saving a filling template from Filling Config tab writes to DB and reloads list from API.
- [ ] Premium linen/fibrecool warehouse variant scoping unchanged on Product tab.
- [ ] Manual: edit a mix in Filling Config, refresh page, changes persist.

## Blocked by

- Slice 02 (composed/warehouse saves non-filling only)
