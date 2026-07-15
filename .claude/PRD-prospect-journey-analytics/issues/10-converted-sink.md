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

- [x] Default view hides Converted / excludes paid Visitors from Prospect cohort appropriately
- [x] Include converted shows muted sink with last-touch Entry source and value
- [x] Journey duration and short path available in tooltip or side panel
- [x] Automated check covers last-touch attribution

## Blocked by

- Slice 07 — Unique-node loops + custom node chrome + side panel

## Done

- `lib/analytics/journey/converted-sink.ts` + `converted-sink.check.ts`
- Aggregates: Prospect cohort excludes `converted_order_id`; `includeConverted` attaches muted Converted sink
- UI: Include converted toggle, muted sink chrome, Converted side panel (last-touch / duration / value / path)
- Merged into `feat/journey-slice-08-returns` with returns + country filters preserved
- Verify: `npx tsx lib/analytics/journey/converted-sink.check.ts`
