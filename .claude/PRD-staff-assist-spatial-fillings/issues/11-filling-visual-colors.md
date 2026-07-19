# Slice 11 — Filling visual colors editable in Product Builder

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 36, 37

## What to build

Product Builder shows the **Filling visual** mapping (filling subtype → fluid shape + color). Shape stays a designer/code concern (read-only); **color** is editable per filling Item type and overrides the code-config default via the CSS variable pipeline from Slice 07. X-ray renders (assist, Configure editor, Result page) pick up overrides everywhere.

## Acceptance criteria

- [ ] Mapping table lists every filling subtype with its shape thumbnail and effective color (default vs override distinguished)
- [ ] Changing a color updates x-ray renders on next load without a deploy; clearing an override restores the code default
- [ ] Shape is not editable in the UI
- [ ] Vitest for override-resolution logic (default → override → cleared)

## Blocked by

- Slice 07 — x-ray renderer (visual config + CSS variables)
- Slice 10 — Product Builder page
