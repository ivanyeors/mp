# 02 — Unified `locations` schema + partner migration

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Migrate the existing partner store into a single **Location** list without changing any
public behavior, and expose a unified query layer plus a partner projection.

- Migration: `ALTER TABLE partners RENAME TO locations`; add `type`
  (`own | partner`, default `partner`, checked), `address text`, `postal_code text`.
  Existing rows become `type='partner'`. Leave `partners_page` (the `/our-partners` CMS
  singleton) untouched.
- Rewire the six readers of `.from("partners")` to `.from("locations")`: the partners lib,
  the three partner API routes (list, `[id]`, reorder), and the two media-usage readers.
- `lib/partners` becomes the **partner projection** — its reads add `type='partner'`; the
  `/our-partners` marquee/cards/`partners-page` consumers are unchanged.
- Add `lib/locations` with `getLocations()` (all rows, own + partner), `getLocation(id)`,
  and a `ResolvedLocation` type.
- Unit test the projection: `getPartners()` returns only `type='partner'` visible rows;
  `getLocations()` returns both types.

## Acceptance criteria

- [ ] Migration renames the table and adds `type` / `address` / `postal_code`; applied locally
- [ ] All existing partner rows are `type='partner'` after migration
- [ ] `/our-partners` marquee + cards render exactly as before (visible partners only)
- [ ] Existing partner admin CRUD still works against `locations`
- [ ] `getLocations()` returns own + partner; `getPartners()` returns partner-visible only
- [ ] Projection unit test passes; existing suite stays green

## Blocked by

- #01 (glossary + ADR 0012 sign-off on the unified model)
