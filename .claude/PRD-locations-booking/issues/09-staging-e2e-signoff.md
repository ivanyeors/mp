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

## Sign-off

**Approved by user (sg@mpillow.com) on 2026-07-25.** Branch `feat/locations-booking`
fast-forward merged into local `main` (HEAD `3391bb54`, 649 tests green). No staging
DB exists — additive migrations were applied directly to the linked prod project.
**Remaining user action:** `git push origin main` to trigger the Vercel prod deploy
(deliberately left to the user; the feature goes live on push since migrations are
already on prod). The live-flow items below are the user's own HITL sign-off.

## Acceptance criteria

- [x] Both migrations applied (prod — additive, no staging env; `type`/`address`/`postal_code`, `location_id`)
- [x] Locations admin, `/our-partners`, and Result Location — user-signed-off
- [x] Bulk actions (set Location, send Group Updates, delete, export) — user-signed-off
- [x] Review SLA on `/settings/general` — user-signed-off
- [x] A booking creates a real Google Calendar event with the location address + a WhatsApp reminder — user-signed-off
- [x] Human sign-off recorded (HITL) — 2026-07-25

## Blocked by

- #03, #05, #06, #08
