# Slice 02 — Configure product cards open a full page with breadcrumbs

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 32

## What to build

Promote the Configure product card slide-in drawer to a full **Configure product page** with breadcrumbs (e.g. Configure / Premium Mpillow / Size M). Existing Product tab and Filling Config tab move over unchanged; the drawer is retired for product card editing.

## Acceptance criteria

- [ ] Clicking a product card in `/settings/inventory/configure` navigates to a dedicated page (deep-linkable URL) instead of opening a sheet
- [ ] Breadcrumbs show Configure / {product} / {size or length} and navigate back correctly
- [ ] Product tab and Filling Config tab behave exactly as before (saves, default template pick, validation)
- [ ] No remaining entry point opens the old drawer for product cards

## Blocked by

None — can start immediately.
