# Slice 15 — Full Admin Panel mobile UX pass

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 28

## What to build

Full `/settings/*` mobile usability pass: stacked layouts, touch-friendly buttons/filters, cards only where interaction needs them, tables scroll **inside** containers (not the page), Admin Menu sheet remains usable with safe-area. Document a mini-audit list in the PR (page → issue → fix). Desktop sidebar behavior preserved.

## Acceptance criteria

- [ ] Priority and remaining Admin Panel routes usable at ~390px without page side-scroll.
- [ ] Primary actions have adequate touch targets; no hover-only critical actions.
- [ ] Admin dock Menu → settings sheet still navigates.
- [ ] PR includes the mini-audit list of pages touched.

## Blocked by

- Soft: slice 12 (global overflow rules) so Settings fixes do not fight page scroll policy.
