# Slice 06 — Persist Pre-order on Result at hold create

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 11

## What to build

When hold create runs under Pre-order trigger, persist sticky Pre-order mode on the **Result**. Surface it on customer Results and Admin Panel Result detail (label/badge). Schema migration or equivalent stable field. Mode does not flip if stock recovers later for that Result.

## Acceptance criteria

- [ ] Hold create under Pre-order stores the mode on the Result.
- [ ] Hold create when not Pre-order stores in-stock / non-pre-order mode (or null/false).
- [ ] Customer Result status and Admin Result detail can show Pre-order.
- [ ] Automated check for persist mapping / payload flag.
- [ ] Sticky: restock does not clear the flag on an existing Result (email is slice 07).

## Blocked by

- Slice 05 (Pre-order trigger must exist to decide at hold create).
