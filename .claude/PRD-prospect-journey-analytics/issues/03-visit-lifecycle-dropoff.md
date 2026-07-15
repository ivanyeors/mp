# Slice 03 — Visit lifecycle + Drop-off sink + tests

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 8, 26, 40

## What to build

Close Visits and expose Drop-off as a first-class sink.

- **Visit lifecycle** module: end Visit after 30 minutes inactivity; best-effort `pagehide` end
- Persist drop-off page (and section when present) + dwell on the Visit
- Journey aggregate includes **Drop-off** sink edges from last page
- Automated tests for timeout / Drop-off fields / new Visit after gap

## Acceptance criteria

- [x] Silent gap ≥ 30 minutes ends Visit and sets Drop-off page from last page_view
- [x] Admin graph/aggregate shows edges into Drop-off sink
- [x] Automated checks cover lifecycle external behavior (not UI snapshots)

## Status

**Done** — verified 2026-07-15.

Proof:
- `npx tsx lib/analytics/journey/lifecycle.check.ts` — 30m rotation, Drop-off fields, sink edges
- Live mpillow DB: inactivity close set `drop_off_path=/shop`; aggregates include `/shop → Drop-off`
- Tracker: `shouldStartNewVisit` + `pagehide` close beacon; server `closeStaleVisitsForVisitor` on ingest

## Blocked by

- Slice 02 — Page-view tracer
