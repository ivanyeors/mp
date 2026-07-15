# Slice 09 — Country: IP→ISO + multi-select color-by-country

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 12, 13, 32, 45, 49

## What to build

Country on Visit for Prospect filtering and comparison.

- At ingest, derive ISO country from IP; store on Visit; do not keep raw IP as a product field
- Unknown bucket when geo fails
- Admin multi-select country filter
- When ≥2 countries selected, color edges/flows by country with legend (mode B)

## Acceptance criteria

- [x] New Visits store country (or Unknown)
- [x] Multi-select filter subsets the graph
- [x] Two+ countries selected → color-by-country legend on one canvas
- [x] Locale cookie is not used as country

## Blocked by

- Slice 07 — Unique-node loops + custom node chrome + side panel

## Done

- `lib/analytics/journey/country.ts` + `country.check.ts`
- Ingest: `resolveCountryFromHeaders(req.headers)` → Visit.country on INSERT (no raw IP column)
- Aggregates: `countries[]` filter; ≥2 → edge.country + `countryLegend`
- UI: Country multi-select + colored edges + legend
- Verify: `npx tsx lib/analytics/journey/country.check.ts`
- Live DB: `npx tsx lib/analytics/journey/slice-08-09.smoke.ts` (country on Visit, multi-select subset, ≥2 → color legend + edge.country, no IP column, headers≠locale)
