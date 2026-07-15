# Slice 02 — Page-view tracer: schema + Visitor + ingest + Admin transitions

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 24, 33, 37, 38, 39, 43

## What to build

Thin end-to-end path: storefront page view lands in our DB and Staff can see page transitions on Analytics from that DB.

- Migrations for `analytics_visitors`, `analytics_visits`, `analytics_events` (minimal columns for page_view)
- Storefront **Visitor** cookie + tracker that sends page_view beacons (not mounted on Admin Panel)
- Ingest API persists Visitor / Visit / events
- Admin Analytics first-section stub (or minimal graph) reads **only** DB and shows page→page transitions for Staff with `analytics` permission
- Dual-write page_view to `dataLayer` when GTM is present (best-effort)

## Acceptance criteria

- [x] Non-admin navigation creates Visitor + Visit + page_view rows in Supabase
- [x] `/settings/*` does not emit journey events
- [x] Staff with `analytics` can open Analytics and see transitions sourced from DB (no live GA query)
- [x] Staff without `analytics` cannot read journey aggregates

## Status

**Done** — verified 2026-07-15.

Proof:
- `npx tsx lib/analytics/journey/journey.check.ts` — path gate, admin reject, loops, RBAC, tracker mount
- `npx tsx app/[lang]/settings/analytics/analytics-ui.check.ts` — Prospect journey above Product Configuration + `assertAdmin` on aggregates
- Live mpillow DB (`irgxjthamhiaolvdfgar`): ingest `/`→`/shop` created Visitor/Visit/events; aggregates returned edge; admin path rejected; test rows cleaned up
- Migration applied on mpillow only (`plugin-supabase`); mistaken apply on unrelated MCP project rolled back

## Blocked by

- Slice 01 — Domain glossary + ADR 0007
