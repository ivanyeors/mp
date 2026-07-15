# Slice 13 — Staging E2E signoff

Type: HITL  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 43, 44, 45, 46

## What to build

Human verification on staging that the Prospect journey graph is demoable end-to-end.

Checklist walkthrough (no new product features):

1. Notice bar + Got it; page views appear in DB for a storefront path
2. Home→Shop→Home shows one Home node with back-edge; Drop-off sink after abandon
3. Expand home sections; last section on Drop-off visible
4. Multi-select two countries → color-by-country legend
5. Return Visit shows dashed re-entry
6. Pay as test buyer → Include converted shows last-touch Entry source + value
7. Confirm no Admin Panel self-traffic in journey; P&L charts still present below

## Acceptance criteria

- [ ] Staging checklist above signed off by a human
- [ ] Any blockers filed; no silent gaps on critical tracers (page, section, drop-off, country, converted)

## Blocked by

- Slice 04 — Analytics notice bar
- Slice 05 — Entry source
- Slice 08 — Returns
- Slice 09 — Country color
- Slice 10 — Converted sink
- Slice 11 — Section tags surfaces
- Slice 12 — GA sync stitch
