# A Location is the partners table extended with a type, not a new table

A **Location** is a physical place a **Result** can originate and an
**Appointment** can be booked at. We model it as the **existing `partners`
table extended additively** with `type text not null default 'partner'
check (type in ('own','partner'))`, `address text`, and `postal_code text` —
**not** a rename to `locations` and **not** a separate `locations` table
alongside `partners`.

- `type='partner'` rows are the **Local Ambassador (clinical)** partners already
  rendered on `/our-partners` (marquee + cards) — unchanged behavior.
- `type='own'` rows are Mpillow studios, new with this work; they never render on
  `/our-partners`.
- `partners_page` (the `/our-partners` CMS singleton) is page content, not a
  Location row, and is left untouched.

## Why additive, not a rename

The `partners` table is read by the **deployed production app** (six `.from(
"partners")` readers: the partners lib, three `app/api/partners/*` routes, and
two media-usage readers). Migrations in this repo are applied with `supabase db
push` straight to the **linked production project** — there is no staging DB.

A `RENAME TO locations` would break every one of those readers the instant the
migration lands, opening a cutover window where production is broken until the
new code deploys. Renaming buys only a nicer physical table name for a
**terminology** change — the domain term **Location** lives in `CONTEXT.md`, and
code reads through `lib/locations` / `lib/partners` regardless of the physical
name.

Additive columns are **nullable or defaulted**, so they are invisible to the
currently-deployed code and safe to `db push` ahead of the deploy (standard
expand/contract). Nothing breaks; no coordinated cutover.

## Code shape

- `lib/partners` becomes the **partner projection**: its reads add
  `.eq("type","partner")` so `/our-partners` keeps showing only partners once
  `own` studios exist.
- New `lib/locations` reads the same `partners` table with **no type filter**
  (`getLocations()` returns own + partner) and carries a `// ponytail:` note that
  the physical table keeps its legacy name.
- `mp_config_responses.location_id` and the booking picker FK-reference
  `partners(id)`.

## Considered options

- **`ALTER TABLE partners RENAME TO locations`** — rejected: destructive to the
  live app with no staging to catch it; a coordinated migrate+deploy window for a
  cosmetic table-name change. The domain term is captured in `CONTEXT.md`, not the
  physical name.
- **A separate `locations` table with partners as a subtype table** — rejected:
  duplicates the partner columns/media-usage wiring, needs a join or a view for
  `/our-partners`, and forks the existing admin CRUD for no behavioral gain.
- **Additive columns on `partners` (chosen)** — one table, one CRUD surface, one
  media-usage path; `type` discriminates own vs partner; prod-safe expand.

## Consequences

- The physical table stays named `partners` while the domain/UI language is
  **Location**. This mismatch is deliberate and documented here + in `CONTEXT.md`;
  do not "fix" it with a later rename without re-evaluating the same cutover risk.
- `type` defaults to `'partner'` so existing rows classify correctly with no
  backfill.
- If a true `locations`-named table is ever needed (e.g. Locations grow columns
  partners should not have), revisit via a new ADR — but the trigger is real
  divergence, not naming aesthetics.
