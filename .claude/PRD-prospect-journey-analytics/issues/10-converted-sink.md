# Slice 10 — Converted sink + Include converted + last-touch

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 2, 16, 17, 18, 46, 50

## What to build

Secondary conversion story without stealing Prospect focus.

- Default graph cohort remains **Prospects** (no paid **Order**)
- Toggle **Include converted** reveals muted **Converted** sink
- Link Visitor → paid **Order** (`paid_at` / capture path) when identity known
- Converted detail: last-touch **Entry source**, journey duration (first Visit start → `paid_at`), order value, short page path
- Automated aggregate test for last-touch credit rule

## Acceptance criteria

- [ ] Default view hides Converted / excludes paid Visitors from Prospect cohort appropriately
- [ ] Include converted shows muted sink with last-touch Entry source and value
- [ ] Journey duration and short path available in tooltip or side panel
- [ ] Automated check covers last-touch attribution

## Blocked by

- Slice 07 — Unique-node loops + custom node chrome + side panel
