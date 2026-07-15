# Slice 05 — Entry source freeze + filter + tests

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 14, 30, 31, 40  
Status: done

## What to build

Machine-captured **Entry source** on Visit start, distinct from **Discovery source**.

- Resolve UTM → referrer host → Direct; freeze on Visit
- Entry source hubs and/or Admin filter on journey view
- Automated tests for resolution precedence
- UI/docs must not label Entry source as Discovery source

## Acceptance criteria

- [x] Visit stores Entry source per UTM/referrer/Direct rules
- [x] Staff can filter the journey view by Entry source
- [x] Automated checks cover resolution order
- [x] No conflation with **Discovery source** in copy or fields

## Proof

- `npx tsx lib/analytics/journey/entry-source.check.ts` — UTM > referrer > Direct; Admin card labels "Entry source"
- `npx tsx lib/analytics/journey/journey.check.ts` — ingest parses optional `entry`
- Freeze: `persistJourneyIngest` writes `entry_*` / `referrer_host` on Visit INSERT only
- Admin: `ProspectJourneyCard` Entry source Select → `getProspectJourneyTransitions({ entrySource })` → `loadPageTransitionsFromDb` filters by `analytics_visits.entry_source`

## Blocked by

- Slice 02 — Page-view tracer
