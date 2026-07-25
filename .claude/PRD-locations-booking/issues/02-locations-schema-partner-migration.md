# 02 — Additive `locations` columns on `partners` + lib

> Decision update (2026-07-25): **additive columns on the existing `partners`
> table — no rename** (prod-safe; there is no staging DB and `db push` targets
> prod). See ADR 0012. The `locations` name lives in the domain/UI + `lib/locations`;
> the physical table stays `partners`.

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Migrate the existing partner store into a single **Location** list without changing any
public behavior, and expose a unified query layer plus a partner projection.

- Migration (additive, no rename): `ALTER TABLE partners ADD COLUMN type`
  (`own | partner`, default `partner`, checked), `ADD COLUMN address text`,
  `ADD COLUMN postal_code text`. Existing rows default to `type='partner'`. Leave
  `partners_page` (the `/our-partners` CMS singleton) untouched.
- The six `.from("partners")` readers **stay as-is** (table name unchanged): the partners
  lib, the three partner API routes (list, `[id]`, reorder), and the two media-usage readers.
- `lib/partners` becomes the **partner projection** — its reads add `.eq("type","partner")`;
  the `/our-partners` marquee/cards/`partners-page` consumers are unchanged.
- Add `lib/locations` with `getLocations()` (all rows, own + partner), `getLocation(id)`,
  and a `ResolvedLocation` type — reads `.from("partners")` (`// ponytail:` legacy name).
- Unit test the projection: `getPartners()` returns only `type='partner'` visible rows;
  `getLocations()` returns both types.

## Acceptance criteria

- [ ] Migration adds `type` / `address` / `postal_code` to `partners` (no rename); pushed to prod
- [ ] All existing partner rows are `type='partner'` after migration
- [ ] `/our-partners` marquee + cards render exactly as before (visible partners only)
- [ ] Existing partner admin CRUD still works
- [ ] `getLocations()` returns own + partner; `getPartners()` returns partner-visible only
- [ ] Projection unit test passes; existing suite stays green

## Blocked by

- #01 (glossary + ADR 0012 sign-off on the unified model)
