# Slice 13 — Site-wide pinch-zoom lock

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 27

## What to build

After overflow fixes (slice 12), lock pinch-zoom site-wide via Next.js root `viewport` (`maximumScale` / `userScalable` or equivalent) so the PWA feels like a web app. Document the accessibility tradeoff in the PR body. Do not ship this before slice 12.

## Acceptance criteria

- [ ] Mobile Safari/Chrome: pinch-zoom does not scale the page.
- [ ] Slice 12 overflow criteria still hold.
- [ ] PR notes intentional a11y tradeoff for app-like behavior.

## Blocked by

- Slice 12 (overflow / font audit first).
