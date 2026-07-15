# Slice 13 — Site-wide pinch-zoom lock

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 27

## What to build

After overflow fixes (slice 12), lock pinch-zoom site-wide via Next.js root `viewport` (`maximumScale` / `userScalable` or equivalent) so the PWA feels like a web app. Document the accessibility tradeoff in the PR body. Do not ship this before slice 12.

## Acceptance criteria

- [x] Mobile Safari/Chrome: pinch-zoom does not scale the page.
- [x] Slice 12 overflow criteria still hold.
- [x] PR notes intentional a11y tradeoff for app-like behavior.

## A11y tradeoff (intentional)

Locking `maximumScale: 1` / `userScalable: false` on the root Next.js `viewport` disables browser pinch-zoom so the PWA feels app-like after overflow/font fixes (slice 12, including ≥16px inputs to avoid iOS focus-zoom). Tradeoff: users who rely on pinch-zoom for low vision lose that browser affordance site-wide. Accepted for this product surface; revisit if WCAG zoom requirements become a hard gate.

## Blocked by

- Slice 12 (overflow / font audit first).
