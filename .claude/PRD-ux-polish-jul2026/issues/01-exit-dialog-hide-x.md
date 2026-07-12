# Slice 01 — Exit dialog: hide overlapping X

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 1–2

## What to build

On the configurator exit confirmation dialog, remove the default corner dismiss control. On mobile it overlaps the Stay button. Stay and Exit (plus backdrop) are enough. Apply wherever `ConfiguratorExitDialog` is used. Wizard bottom Close unchanged.

## Acceptance criteria

- [ ] Exit dialog has no corner X / OverlayDismiss on mobile or desktop.
- [ ] Stay and Exit remain usable; Exit clears session as today.
- [ ] Mobile wizard bottom Close still opens the exit dialog.
- [ ] Desktop toast-only exit path unchanged if it does not use this dialog.

## Blocked by

None - can start immediately.
