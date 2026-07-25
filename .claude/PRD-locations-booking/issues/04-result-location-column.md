# 04 — Result Location column

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Let operators record and edit where a **Result** originated, without touching the auto
**Source** channel badge.

- Migration: add `location_id` (nullable, FK → `partners(id)`) to `mp_config_responses`,
  mirroring the discovery-source migration pattern. (Locations live in `partners` — ADR 0012.)
- The Results responses GET returns `location_id`; the Results page loads the locations list
  once for labels + dropdown options.
- Add an editable **Location** column after **Source** in the Results table: a `<Select>` of
  all locations (own + partner) that persists through the existing responses upsert.
  `stopPropagation` so row-click navigation is unaffected. The **Source** badge is unchanged.

## Acceptance criteria

- [ ] `mp_config_responses.location_id` migration applied locally
- [ ] Results table shows a Location column after Source
- [ ] Selecting a location persists and survives reload
- [ ] The auto Source badge (In-store / Online / Purchase) is visually and behaviorally unchanged
- [ ] Row click still navigates to the Result detail

## Blocked by

- #02 (locations list to populate the dropdown; #03 provides own studios to pick)
