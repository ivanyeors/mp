# Slice 03 — Reminder log + day-before Confirm path (cron → WA → webhook Confirm)

Type: AFK
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 1–4, 15–16, 26–32, 35

## What to build

First end-to-end tracer bullet: daily cron finds tomorrow's appointments, sends day-before WhatsApp templates, and handles **Confirm** replies.

- **Migration:** `appointment_reminders` table keyed by `calendar_event_id` (phone, name, type, `starts_at`, status, WA message ids, timestamps).
- **Deep modules (implement + test):** `appointment-phone`, `appointment-type`, `appointment-reminder-state` (confirm path only for this slice).
- **`google-calendar`:** OAuth list/filter tomorrow's events on `primary` — not cancelled, not all-day, guest name + valid phone; type from summary.
- **`whatsapp`:** send day-before utility template with Confirm/Reschedule quick replies; webhook verify + handle Confirm button → `confirmed`.
- **Cron route:** `/api/cron/appointment-reminders` at `0 1 * * *` UTC (09:00 SGT); `CRON_SECRET` Bearer; idempotent send per event + message kind; non-prod allowlist.
- **Second cron entry** in deployment config (or document Hobby fallback to chain from SLA cron).
- Reschedule button may be received but full slot flow is slice 04 — stub or no-op beyond logging is acceptable until 04 lands.

Demoable outcome: book test appointment for tomorrow, run cron (or wait), receive day-before WA, tap Confirm, row shows `confirmed`, no calendar change.

## Acceptance criteria

- [ ] `appointment_reminders` migration applied; row created per eligible tomorrow event.
- [ ] Invalid phone → `skipped_invalid_phone`, no WhatsApp send.
- [ ] Valid SG phone formats normalize to E.164; unit tests cover normalize/validate.
- [ ] Day-before template sent once per event (idempotent on retry).
- [ ] Webhook Confirm updates status to `confirmed`; duplicate Confirm is safe.
- [ ] Cron returns JSON summary `{ ok, scanned, reminded, confirmed, skipped, errors }`.
- [ ] Non-prod allowlist blocks sends to numbers not on list.
- [ ] `appointment-type` and `appointment-reminder-state` unit tests pass for confirm path.
- [ ] Events without phone or all-day or cancelled are not messaged.

## Blocked by

- Slice 01 (Meta WABA + Google OAuth + approved templates)
- Slice 02 (appointment settings keys and defaults)
