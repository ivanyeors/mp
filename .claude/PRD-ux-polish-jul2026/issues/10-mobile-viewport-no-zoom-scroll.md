# Slice 10 — Mobile viewport: no zoom / no side scroll

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 16–17
PR group: **E**

## What to build

1. **No pinch-zoom** on mobile views — set Next.js root `viewport` (`maximumScale: 1`, `userScalable: false` or equivalent supported fields) in `app/layout.tsx`. Document the accessibility tradeoff in the PR body (intentional product choice from feedback).
2. **No page-level horizontal scroll** — audit and fix overflow offenders on landing, configurators, slide-ins, and Admin Panel shells (`min-w-0`, contain wide tables inside local `overflow-x-auto`, shrink carousel cards). Prefer fixing sources over only `overflow-x: hidden` on `html`.

Primary paths:

- `app/layout.tsx` (viewport export)
- `app/globals.css`
- Offenders found in audit (hero, tier picker, apple-cards-carousel, settings tables)

## Acceptance criteria

- [ ] Mobile Safari/Chrome: pinch-zoom does not scale the page.
- [ ] Home, mp-config, mbolster-config, Science of Sleep sheet, `/settings/orders`: no page-level horizontal scroll at 390px width.
- [ ] Intentional local horizontal scroll (e.g. a contained carousel) does not widen the document.
- [ ] Inputs remain usable (pair with slice 04 / 16px font if iOS still zooms on focus before viewport lock).

## Proof

Device checklist on PR for the routes above.

## Blocked by

Soft: prefer after slice 09 so clearance/overflow changes land together in PR E.
