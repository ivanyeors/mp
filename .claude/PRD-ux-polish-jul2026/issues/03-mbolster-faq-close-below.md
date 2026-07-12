# Slice 03 — Mbolster FAQ close below accordion

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 5
PR group: **B**

## What to build

Mbolster welcome (i) FAQ dialog currently uses default `DialogContent` corner close (fixed on mobile). Match the Mpillow FAQ pattern:

- `DialogContent hideClose`
- After `PageFaqAccordion`, render `OverlayDismissButton variant="inline"` in normal document flow (below FAQ), not `position: fixed`

Primary paths:

- `app/[lang]/mbolster-config/mbolster-config-client.tsx` (~welcome Info dialog)
- Reference: `app/[lang]/mp-config/mp-config-client.tsx` FAQ dialog

## Acceptance criteria

- [ ] Mobile: close control appears below the FAQ accordion content and scrolls with the dialog body.
- [ ] No fixed/corner X competing with the accordion on small viewports.
- [ ] Desktop: dialog remains usable; close still reachable.
- [ ] FAQ content itself unchanged.

## Proof

Staging mobile screenshot/notes on PR. No new test framework — optional assert in a tiny check that the FAQ dialog JSX includes `hideClose` if shared helper is extracted.

## Blocked by

None. Prefer after or with slice 05 if preview layout shifts, but not required.
