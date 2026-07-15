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

- [ ] Second Visit after Drop-off shows dashed re-entry into landing page node
- [ ] Return hits / median gap appear on affected page nodes
- [ ] New vs Returning filter changes the graph cohort
- [ ] Same-session backtracks remain solid edges (not “Returned”)

## Blocked by

- Slice 07 — Unique-node loops + custom node chrome + side panel
