# Slice 12 — Add-on image cards + selected previews on the left

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 38, 39, 40

## What to build

Add-ons get imagery from the inventory **Item**'s primary **Media Asset** (adds the item → primary-image link if not present; not Product Builder territory):

- Right rail: add-on options render as smaller cards with image + name + MSRP (selection stays on the right; graceful text-only fallback when an Item has no image)
- Left column: images of *selected* add-ons appear under the pillow silhouette — row on desktop (per mockup), stacked on mobile
- Applies to all three configurator previews

## Acceptance criteria

- [ ] Add-on with a primary image shows an image card; without one falls back to the current row style
- [ ] Selecting an add-on adds its image under the silhouette; deselecting removes it
- [ ] Mobile stacks the selected previews vertically without breaking the preview layout
- [ ] Size/length-scoped add-on eligibility (`lib/results/addons.ts`) unchanged
- [ ] `*.check.ts` for the item→image resolution + left-preview wiring

## Blocked by

None — can start immediately.
