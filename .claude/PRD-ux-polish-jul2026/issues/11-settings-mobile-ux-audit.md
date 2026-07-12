# Slice 11 — Settings mobile UX audit

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 18
PR group: **F**

## What to build

Audit Admin Panel (`/settings/*`) on mobile for UX-friendly buttons, cards, and interactions:

- Touch targets ≥ ~44px where primary actions are cramped
- Filters / toolbars stack instead of forcing side scroll
- Cards: only where they contain interaction; avoid nested card chrome that wastes width
- Bottom admin Menu sheet remains usable with safe-area
- Tables: horizontal scroll **inside** the table container only, not the page

Fix the worst offenders found in the audit (Orders, Inventory, Configure, Analytics as priority). Keep desktop sidebar behavior.

Primary paths:

- `components/settings/settings-sidebar-nav.tsx`
- `app/[lang]/settings/**/page.tsx` (priority pages)
- Shared UI used by settings forms/tables

## Acceptance criteria

- [ ] Written mini-audit list in the PR (page → issue → fix).
- [ ] Priority settings pages stack on 390px without page side-scroll.
- [ ] Primary buttons remain tappable; no hover-only critical actions.
- [ ] Admin dock Menu → settings sheet still opens and navigates.

## Proof

Mobile screenshots for Orders + one Inventory/Configure screen after fixes.

## Blocked by

Soft: after slice 10 (viewport/overflow) so page scroll rules are stable.
