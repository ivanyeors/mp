# Slice 08 — X-ray dive editing + flubber morphs

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 14, 8, 9, 18

## What to build

Make the x-ray editable: click a **Section** to dive into its **sub-sections**; add/remove inventory filling pieces per **cell** (start 1, max 5) directly on the canvas. Add `flubber` (the PRD's one approved new dependency) for prepared path morphs when a piece's filling type is swapped; crossfade fallback on degenerate pairs. Dive/return transitions via installed `framer-motion`/`gsap`. Target 60fps on a mid-range tablet.

## Acceptance criteria

- [ ] Section click dives to sub-section view; back/escape returns; edits land in session state identically to the Slice 04 list editor
- [ ] Cap and inventory-only rules enforced on-canvas with visible feedback
- [ ] Type swap morphs smoothly; a degenerate morph pair falls back to crossfade (no flicker/self-intersection artifacts)
- [ ] No layout thrash: animations touch transform/`d` only (spot-check with devtools profiling)
- [ ] `*.check.ts` asserting morph-pair preparation and fallback wiring

## Blocked by

- Slice 07 — x-ray renderer
