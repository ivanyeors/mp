# Slice 03 — Spatial cell editor in the Filling Config tab

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 8, 9, 31, 37

## What to build

Operators create and edit **Filling Templates** spatially in Configure: a 3×3 grid (Section × sub-section) where each **cell** starts with one piece slot and can add up to 5, pieces picked from inventory filling **Items** only. A read-only derived BOM (pack list) view sits alongside. Saving writes **Placement** rows via the Slice 01 API. Editing a legacy-flat template converts it to placements on first spatial save.

## Acceptance criteria

- [ ] Operator can build a template cell-by-cell (add/remove pieces, same item repeated), capped at 5 per cell with clear UI feedback
- [ ] Derived BOM view updates live from placements and matches the flatten from `lib/spatial-fillings`
- [ ] Legacy flat templates open with an empty grid + flat-lines notice; first spatial save persists placements
- [ ] Pillow editors never offer bolster mixes and vice versa (existing scoping preserved)
- [ ] One `*.check.ts` or vitest covering save→reload fidelity of a full 9-cell recipe

## Blocked by

- Slice 01 — spatial placements core
- Slice 02 — Configure product page (editor lives on the new page)
