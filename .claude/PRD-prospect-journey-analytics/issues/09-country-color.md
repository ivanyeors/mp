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

- [ ] New Visits store country (or Unknown)
- [ ] Multi-select filter subsets the graph
- [ ] Two+ countries selected → color-by-country legend on one canvas
- [ ] Locale cookie is not used as country

## Blocked by

- Slice 07 — Unique-node loops + custom node chrome + side panel
