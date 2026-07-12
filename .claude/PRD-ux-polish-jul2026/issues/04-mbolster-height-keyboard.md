# Slice 04 — Mbolster height keyboard input

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 6
PR group: **B**

## What to build

Fix the height step so users can type into the height field with the mobile soft keyboard (decimal / unit toggle m|cm).

Likely causes to investigate (pick the smallest fix):

- Focus stolen by re-renders / autoFocus loops
- Parent `100dvh` / dock / scroll container not resizing with `visualViewport`
- Controlled input parsing rejecting intermediate strings (e.g. `""`, `1.`, `.5`)
- Zoom-from-font-size (pair with slice 10 if `<16px`)

Primary paths:

- `app/[lang]/mbolster-config/mbolster-config-client.tsx` (height step)
- `components/ui/input.tsx`

## Acceptance criteria

- [ ] Mobile: tap height field → keyboard opens → can type and edit digits and decimal separator.
- [ ] Switching m/cm does not clear focus unexpectedly mid-edit unless intentional.
- [ ] Intermediate values while typing do not wipe the field.
- [ ] Continue validation still rejects empty / out-of-range on submit.

## Proof

HITL: iOS Safari + Android Chrome height step recording or checklist on PR.

## Blocked by

None.
