# 01 — Glossary + ADRs: Location, Source clarification, custom booking

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Establish the shared language and architectural decisions the rest of the PRD depends on,
so the unified-locations model and custom-booking approach are signed off before code.

- Add a **Location** term to `CONTEXT.md`: a physical place a **Result** can originate and
  an **Appointment** can be booked at (`locations`, `type: own | partner`). `own` = Mpillow
  studios; `partner` = external clinic (**Local Ambassador**) shown on `/our-partners` when
  `visible`. `_Avoid_`: conflating with **Source**, **Discovery source**, **Entry source**.
- Amend **Source** (Result channel provenance) `_Avoid_` line to call out **Location**.
- Amend **Appointment**: booked via Mpillow's own booking page with a **Location** picker
  that writes to Google Calendar via API; the picked Location's address stamps the event;
  single shared availability from appointment settings. Note **Local Ambassador (clinical)**
  is a `type='partner'` **Location**.
- Write **ADR 0012 — unified locations (partner as a subtype)**: one `locations` table with
  a partner subtype vs. separate partners+locations tables.
- Write **ADR 0013 — custom multi-location booking on the Google Calendar API**: custom
  picker + `events.insert` with single shared availability vs. Google's iframe or
  per-location Google schedules.

## Acceptance criteria

- [ ] `CONTEXT.md` defines **Location** and cross-links Source / Discovery source / Entry source
- [ ] `CONTEXT.md` **Appointment** and **Local Ambassador** entries reflect locations + booking
- [ ] `docs/adr/0012-locations-unified-partner-model.md` exists with the trade-off recorded
- [ ] `docs/adr/0013-custom-multi-location-booking.md` exists with the trade-off recorded
- [ ] Human sign-off on the terminology and both ADRs (HITL)

## Blocked by

None - can start immediately
