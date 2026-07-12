# Slice 03 — Mbolster height decimal draft input

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 4

## What to build

Fix height entry so intermediate decimals (e.g. `1.`) are not wiped on each keystroke. Root cause: display round-trips through `parseFloat` / normalize on every change. Keep a draft display string while typing; normalize/clamp on blur or Continue. Include a small automated check for draft vs normalize rules.

## Acceptance criteria

- [ ] Typing `1.` then more digits works in `m` unit without the field resetting to `1`.
- [ ] Unit toggle m/cm still converts correctly after a committed value.
- [ ] Continue still rejects empty / out-of-range heights.
- [ ] Automated check covers intermediate draft strings.

## Blocked by

None - can start immediately.
