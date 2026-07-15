# Slice 08 — Returns: dashed re-entry + return metrics

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 10, 15, 27

## What to build

Show come-backs without duplicating multi-day paths.

- Detect Returning **Visitor** (prior ended Visit on same Visitor)
- Dashed re-entry edge into landing page after prior Drop-off
- Node metrics: return hits, median return gap
- New vs Returning filter on the journey view
- Side panel return timeline

## Acceptance criteria

- [x] Second Visit after Drop-off shows dashed re-entry into landing page node
- [x] Return hits / median gap appear on affected page nodes
- [x] New vs Returning filter changes the graph cohort
- [x] Same-session backtracks remain solid edges (not “Returned”)

## Blocked by

- Slice 07 — Unique-node loops + custom node chrome + side panel

## Done

- `lib/analytics/journey/returns.ts` + `returns.check.ts`
- Aggregates load visitor history, attach dashed `__drop_off__`→landing edges, cohort filter
- Prospect journey UI: Visitors New/Returning select, dashed SVG edges, return chrome + side-panel timeline
- Verify: `npx tsx lib/analytics/journey/returns.check.ts`