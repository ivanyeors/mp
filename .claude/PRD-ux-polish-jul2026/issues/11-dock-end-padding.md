# Slice 11 — Dock: show at page end + trim padding

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 22–25

## What to build

1. Trim excess marketing bottom padding that double-counts dock clearance.
2. App dock: keep hide-on-scroll-down and show-on-scroll-up / near top; **also show when near document bottom**.
3. Configurator post-welcome `dock-hidden` unchanged.

## Acceptance criteria

- [x] Less empty space above the dock on home without content sitting under the dock.
- [x] Scrolling to the end of the home page shows the dock.
- [x] Mid-page scroll-down can still hide the dock; scroll-up reveals it.
- [x] Configurator dock-hidden after welcome unchanged.

## Proof (2026-07-13)

Dock shows when `isNearDocumentBottom` (within 24px of document end); top/scroll-up/down rules unchanged. Marketing footer/hero dropped double-counted clearance. Configurator `dock-hidden` toggles untouched.

```bash
npx tsx components/ui/app-dock-visibility.check.ts
# → app-dock-visibility.check.ts: ok
```

Note: hero `pb` trim may need reconcile with slice 09 (CTA band placement).
