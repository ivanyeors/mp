# 09 — Staging E2E sign-off

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Apply the migrations to staging and manually verify every flow end-to-end, including a real
Google Calendar write and a real WhatsApp reminder. HITL sign-off gate before release.

- Apply the additive `partners` columns (`type`/`address`/`postal_code`) and
  `mp_config_responses.location_id` migrations (pushed to the linked prod project — no rename).
- Manually verify: Locations CRUD (own + partner), `/our-partners` shows only visible
  partners, Result Location single + bulk set, bulk Send/Delete/Export, Review SLA on
  `/settings/general`, and a booking that creates a real Google Calendar event with the
  correct address and schedules a WhatsApp reminder.

## Acceptance criteria

- [ ] Both migrations applied to staging without error
- [ ] Locations admin, `/our-partners`, and Result Location verified on staging
- [ ] Bulk actions (set Location, send Group Updates, delete, export) verified
- [ ] Review SLA verified on `/settings/general`
- [ ] A booking creates a real Google Calendar event with the location address + a WhatsApp reminder
- [ ] Human sign-off recorded (HITL)

## Blocked by

- #03, #05, #06, #08
