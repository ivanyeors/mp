# Slice 02 — Search & AI visibility section — KPI row + trend charts

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 2, 4, 13, 14, 15, 19

## What to build

- New "Search & AI visibility" section on `/[lang]/settings/analytics` (server action with `assertAdmin`, reads Supabase only)
- `lib/seo-metrics/aggregate.ts`: period rollups, previous-period deltas, CTR/position recomputed from sums
- KPI row: clicks, impressions, CTR, avg position (lower = good colouring), each with a delta and sparkline. AI tiles appear once slices 03/04 land.
- visx small multiples: clicks and impressions on a shared x-axis; avg position on an inverted y-axis
- Weekly default, daily toggle; date range + compare-period picker; last 3 days dashed and labelled "partial"
- Load the `dataviz` skill before writing chart code

## Acceptance criteria

- [ ] (after backfill) Numbers match the GSC UI for the same range (±1% from rounding)
- [x] No chart averages averages (covered by tests in `aggregate`)
- [x] Partial-data region visible on the daily and weekly views
- [x] Empty state when no data has been ingested yet

## Blocked by

Slice 01
