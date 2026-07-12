# Slice 09 — Bottom padding + dock at page end

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 14–15
PR group: **E**

## What to build

1. **Reduce excess bottom padding** on marketing surfaces where clearance is double-applied (hero + footer + body PWA padding). Keep enough to clear the dock; remove the empty “dead zone.”
2. **Show the app dock when the user reaches the end of the page** — today the dock hides on scroll-down and only returns on scroll-up / near top. Add near-bottom visibility so end-of-page users still see Home / configs.

Primary paths:

- `components/ui/app-dock.tsx`
- `app/globals.css` (`--mobile-bottom-clearance`, `--app-dock-clearance`)
- `components/ui/marketing-footer.tsx`
- `components/sections/landing/hero-section.tsx` (only clearance interaction)

## Acceptance criteria

- [ ] Marketing pages: less empty space above the dock without content sitting under it.
- [ ] Scrolling to the bottom of the home page shows the dock.
- [ ] Scroll-down hide behavior can remain mid-page; end-of-page and scroll-up still reveal the dock.
- [ ] Configurator `dock-hidden` after welcome unchanged.

## Proof

HITL scroll-to-end on home (mobile). Optional note in PR describing the new dock visibility rule in one sentence.

## Blocked by

None.
