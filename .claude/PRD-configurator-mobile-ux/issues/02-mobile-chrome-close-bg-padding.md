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

- [x] On mobile, post-welcome steps have no Particles/RetroGrid/DotPattern; background is solid.
- [x] On desktop, welcome and post-welcome animated backgrounds behave as today.
- [x] Mobile side padding is reduced vs current without breaking readability.
- [x] Mobile past welcome: bottom Close visible; top-right X absent.
- [x] Mobile Close opens a centered Stay/Exit dialog; Exit clears session as today (start/home).
- [x] Desktop X still uses toast exit confirm.
- [x] Bottom Close respects safe-area / home indicator patterns used by slide-ins.
- [x] Applied to both Mpillow and Mbolster configurators.

## Proof

```bash
npx tsx components/configurator/configurator-mobile-chrome.check.ts
# → configurator-mobile-chrome.check.ts: ok
```

Shared: `components/configurator/configurator-mobile-chrome.tsx`  
Wired: `mp-config-client.tsx`, `mbolster-config-client.tsx`

## Blocked by

None — can start immediately.
