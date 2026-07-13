# Slice 08 — Landing header: Profile left + logo clearance

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 16–18

## What to build

Expanded landing header: Profile (signed-in only) in the **left** column; logo centered; language + theme on the right. Guests: left empty (Sign in stays on dock Menu). Fix small-screen overlap so the right cluster does not eat into the logo (rebalance columns / sizing / gaps). Compact scroll dock unchanged.

## Acceptance criteria

- [x] Signed-in: Profile on the left; logo centered; language + theme on the right.
- [x] Signed-out: no header Sign-in; left column empty/balanced.
- [x] On a narrow phone width, logo is not overlapped by language/Profile/theme controls.
- [x] Compact Online / In-Person / WhatsApp bar unchanged.

## Proof (2026-07-13)

Expanded header: Profile left, logo center (shrinks on narrow), language+theme right. Compact dock unchanged.

```bash
npx tsx components/ui/landing-header-hero.check.ts
# → landing-header-hero.check.ts: ok
```
