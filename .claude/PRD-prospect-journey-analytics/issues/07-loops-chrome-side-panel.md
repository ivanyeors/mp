# Slice 07 — Unique-node loops + custom node chrome + side panel

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 3, 6, 9, 19, 44

## What to build

Product viz: unique page nodes with back-edges and agreed custom chrome.

- Aggregate model: one node per page; Home→Shop→Home is a back-edge, not a second Home column
- Page node chrome: Prospects, drop-off %, median dwell, top drop-off section (return fields may stub until slice 08)
- Edge thickness ∝ transition count
- Journey section placed above Product Configuration on Analytics
- Node click → side panel (exit sections, dwell, sample paths)

## Acceptance criteria

- [x] Looping path reuses a single page node with a back-edge
- [x] Custom node metrics render for pages in range
- [x] Side panel opens from node click with path/dwell/exit detail
- [x] Section sits above Product Configuration; P&L charts remain below

## Proof

- Check: `npx tsx lib/analytics/journey/loops-chrome.check.ts`
- Live DB (mpillow): Home→Shop→Home → 1 Home node; back-edge count ≥ 1; chrome `{prospects, dropOffPct, medianDwellMs, topDropOffSection}`; side panel sample path `/→/shop→/` + exit `#pick-your-mpillow`
- Placement: `AnalyticsClient` still renders `<ProspectJourneyCard` before `<ProductConfigurationCard`

## Blocked by

- Slice 03 — Visit lifecycle + Drop-off sink
- Slice 06 — Section tracer
