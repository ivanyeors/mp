# 03 — Locations admin page (type / address / postal, own studios)

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Turn the existing partners settings surface into a **Locations** admin page so staff manage
own studios and partners in one place.

- Repurpose the partners settings page into a Locations page; rename the settings sidebar
  nav label to **Locations**.
- Add per-row fields: **type** toggle (`own` / `partner`), **address**, **postal code**.
- Keep existing partner fields (name, logo via the shared media picker, website,
  description, visibility, reorder) — these apply to `type='partner'` rows.
- Keep the "Work With Us" tab (edits `partners_page`) unchanged.
- Staff can create an `own` studio (name + address + postal) and a `partner` (with logo +
  address); own studios never appear on `/our-partners`.

## Acceptance criteria

- [ ] Settings nav shows **Locations**; the page lists all locations with their type
- [ ] Adding an `own` studio persists name/address/postal
- [ ] Adding/editing a `partner` persists logo/address/postal/visibility/order
- [ ] `/our-partners` shows only `type='partner'` visible rows; `own` studios never leak
- [ ] "Work With Us" (partners_page) editing still works

## Blocked by

- #02 (unified `locations` schema + lib)
