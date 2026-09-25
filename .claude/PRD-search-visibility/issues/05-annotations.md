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

- [ ] Markers render on all time-series charts and respect the date range
- [ ] Non-admins cannot read or write annotations (RLS)

## Blocked by

Slice 02
