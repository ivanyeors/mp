# Slice 02 — Exit dialog: remove corner X

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 3–4
PR group: **A**

## What to build

On the configurator **exit confirmation** dialog (`ConfiguratorExitDialog`), remove the default corner close (X). Stay and Exit are sufficient.

- Use `DialogContent hideClose` (already supported) or equivalent on the exit dialog only.
- Do not remove bottom Close / OverlayDismiss on the wizard chrome itself.
- Apply wherever `ConfiguratorExitDialog` is used (Mpillow + Mbolster).

Primary paths:

- `components/configurator/configurator-mobile-chrome.tsx`
- `components/ui/dialog.tsx` / `overlay-dismiss.tsx` (only if shared API needs a tweak)

## Acceptance criteria

- [ ] Exit confirmation shows Stay + Exit; no corner X / OverlayDismiss on that dialog.
- [ ] Backdrop / Escape behavior remains sensible (dismiss = Stay, or keep prior behavior — document choice).
- [ ] Wizard bottom Close still opens the exit dialog on mobile.
- [ ] Desktop toast exit path unchanged if it does not use this dialog.

## Proof

```bash
npx tsx components/configurator/configurator-mobile-chrome.check.ts
# → configurator-mobile-chrome.check.ts: ok
# Extend check to assert exit dialog uses hideClose if trivial.
```

## Blocked by

None — can start immediately. Ship with slice 01 in PR A.
