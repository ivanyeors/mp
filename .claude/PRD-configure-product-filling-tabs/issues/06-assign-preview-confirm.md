# Slice 06 — Assign preview + confirm UX

Type: AFK
Parent: PRD `configure-product-filling-tabs` (`.claude/PRD-configure-product-filling-tabs/configure-product-filling-tabs-prd.md`)
Triage: needs-triage
User stories covered: 10, 11, 12, 13, 14, 15, 16, 27, 29

## What to build

Operator assignment screen shows the **complete product** preview and requires explicit filling confirmation.

- **`filling-preview`** module: format template lines as `{ variant, qty }[]` for UI (if not done in slice 05).
- Extend assign data loading: for selected size×tier or length, fetch composed sellable non-filling BOM summary + `default_filling_template_id` + default preview lines.
- UI: two collapsible sections —
  - **Product:** read-only non-filling lines (protector, packaging, etc.).
  - **Filling mix:** default hint (template name + preview); dropdown starts **empty**; preview updates on selection.
- Changing size, tier, or length: clear filling dropdown selection; reload Product section, catalog, and default hint.
- Assign Save still requires explicit `fillingTemplateId` (lifecycle unchanged); inactive templates not in dropdown.
- Optional API field on assign prep endpoint to avoid N+1 fetches.

## Acceptance criteria

- [ ] Assign shows Product + Filling mix sections when status allows assign.
- [ ] Default template name and filling preview shown as hint; dropdown not pre-filled.
- [ ] Save blocked until operator selects a filling template.
- [ ] Changing size or tier clears prior filling selection and updates both sections.
- [ ] Changing bolster length clears filling selection and reloads hint.
- [ ] Inactive filling templates do not appear in dropdown.
- [ ] Hint shows "No default configured" when product card has no default.
- [ ] After assign + accept path, order build lines match composed non-filling + confirmed template (integration with `build-assembly` / `loadAssignedBuild`).
- [ ] Behavior tests for preview formatter; assign lifecycle tests still pass.

## Blocked by

- Slice 05 (defaults exist in DB for hint)
- Slice 03 (legacy data migrated; production-like defaults available)
