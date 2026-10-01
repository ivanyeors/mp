# Slice 05 — SEO annotations on charts

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 17, 18

## What to build

- Migration `seo_annotations (id, date, label, category, url, created_by)`
- Admin CRUD inline in the visibility section
- Vertical markers with hover labels on every time-series chart in the section
- Seed data: domain migration, llms.txt curated, configurator SEO shells, guides launch, product ratings (dates from git history of `PRD-seo-aeo-geo` slices)

## Acceptance criteria

- [x] Markers render on all time-series charts and respect the date range
- [x] Non-admins cannot read or write annotations: RLS on with no client grants; server actions check `assertAdmin("analytics")`

## Blocked by

Slice 02

## Implementation notes

- Seeds are the 2026-07-10 merge dates from git history (domain move, SEO foundations) plus visit tracking starting on 2026-07-15. These are merge dates, not deploy dates.
- Native SVG `<title>` tooltips on the marker dots. Marker lines ignore pointer events, so chart hover still works underneath.
