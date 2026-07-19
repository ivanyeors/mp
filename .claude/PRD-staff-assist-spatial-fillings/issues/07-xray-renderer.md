# Slice 07 — X-ray renderer (read-only) from designer SVG

Type: HITL — needs the designer SVG export (silhouette + 9 cell boundary paths + per-filling fluid shapes) and a visual design review
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 12, 13, 15, 16, 17, 37

## What to build

Read-only **X-ray filling editor** rendering, replacing the Slice 04 list panel's visual half. ADR 0009 guardrails are binding.

- Ingest the designer SVG: silhouette + per-cell boundary paths as `clipPath` regions (nested silhouette ∩ cell clipping — no rect crops anywhere)
- Code config map `filling subtype → fluid shape asset + default color` (CSS variables); shapes inlined and tagged `data-item-subtype`
- Deterministic slot layout for 1–5 pieces per cell; compression keeps each piece's outline distinct (no gooey merge)
- Hover highlights the three **Sections**; x-ray art direction (shell desaturates, fillings visible inside)
- Renders the assist session mix live; same renderer usable on the Result page later

## Acceptance criteria

- [ ] Same placements always produce an identical render (layout function is pure + vitest-covered)
- [ ] No straight clip edge visible that is not a designed section divider (visual review sign-off)
- [ ] Five pieces in one cell remain individually countable
- [ ] Hovering a Section highlights exactly that region; guests never see the mode
- [ ] Colors resolve from the config map via CSS variables (ready for Slice 11 overrides)

## Blocked by

- Slice 04 — Staff assist chrome
- Designer SVG asset delivery (external)
