# Slice 12 — Mobile overflow / no side-scroll

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 26

## What to build

Audit and fix page-level horizontal overflow on marketing, configurators, Science of Sleep sheet, and Admin shells. Prefer fixing sources (`min-w-0`, contained local scroll) over only hiding overflow on `html`. Keep intentional contained carousels from widening the document. Do **not** lock pinch-zoom in this slice (slice 13).

## Acceptance criteria

- [ ] Home, mp-config, mbolster-config, Science of Sleep sheet, and a sample `/settings` page: no page-level horizontal scroll at ~390px width.
- [ ] Contained carousels do not widen the document.
- [ ] Inputs remain ≥16px font on mobile where needed to avoid focus-zoom before slice 13.

## Blocked by

- Soft: slice 11 (dock/padding tokens) so clearance and overflow land coherently.
