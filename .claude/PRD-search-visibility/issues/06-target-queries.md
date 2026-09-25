# Slice 06 — Target-query watchlist + movers

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 5, 6

## What to build

- Migration `seo_target_queries`, seeded from the target queries in `lib/seo/llms-index.ts`
- Watchlist table: query, current position, Δ position, clicks, impressions, 12-week sparkline, ranking URL
- Movers: top 10 query and top 10 page gainers/losers by Δclicks vs the previous period, with a minimum-impressions threshold
- Add/remove target queries from the UI

## Acceptance criteria

- [ ] Watchlist position matches GSC for the same query and range
- [ ] Movers ignore rows below the impression threshold
- [ ] Shows "not ranking" instead of a blank when a query has no data

## Blocked by

Slice 01
