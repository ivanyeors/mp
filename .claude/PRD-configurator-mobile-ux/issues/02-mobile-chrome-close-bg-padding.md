# Slice 02 — Mobile chrome: Close, bg, padding

Type: AFK
Parent: PRD `configurator-mobile-ux` (`.claude/PRD-configurator-mobile-ux/configurator-mobile-ux-prd.md`)
Triage: needs-triage
User stories covered: 9–20, 42

## What to build

Mobile-only configurator chrome for Mpillow (full/basic) and Mbolster:

- After Get Started: unmount Particles / RetroGrid / DotPattern; solid `bg-background` for post-welcome steps (including preview).
- Tighter side padding on small screens (baseline: outer `p-4` → `px-3`, card `p-8` → `p-5`).
- Remove top-right X on mobile; add bottom Close in the same language as landing slide-in dismiss (`OverlayDismissButton` / sticky bottom safe-area).
- Bottom Close opens a **centered** exit confirmation Dialog (not Sonner toast).

Desktop unchanged for this slice: keep animated backgrounds, existing padding, top-right X, and toast exit confirm.

## Acceptance criteria

- [ ] On mobile, post-welcome steps have no Particles/RetroGrid/DotPattern; background is solid.
- [ ] On desktop, welcome and post-welcome animated backgrounds behave as today.
- [ ] Mobile side padding is reduced vs current without breaking readability.
- [ ] Mobile past welcome: bottom Close visible; top-right X absent.
- [ ] Mobile Close opens a centered Stay/Exit dialog; Exit clears session as today (start/home).
- [ ] Desktop X still uses toast exit confirm.
- [ ] Bottom Close respects safe-area / home indicator patterns used by slide-ins.
- [ ] Applied to both Mpillow and Mbolster configurators.

## Blocked by

None — can start immediately.
