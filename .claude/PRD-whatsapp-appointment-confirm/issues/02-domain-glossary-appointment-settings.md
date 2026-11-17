# Slice 02 — Domain glossary + appointment settings (keys, API, `/settings/appointments`)

Type: AFK
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 20–25, 38

## What to build

Land domain vocabulary and the operator-facing settings surface so appointment rules are editable without redeploying secrets.

- **CONTEXT.md glossary:** add **Appointment**, **Appointment reminder**, **Customisation appointment**, **Re-adjustment appointment** with `_Avoid_` disambiguation (no Order link in v1).
- **`appointment-settings` module:** typed parse/store for `site_settings` keys — venue (default `22 Sin Ming Lane, #08-83, Midview City, Singapore 573969`), duration (60), open/close hours (10:00–18:00 last bookable start), bookable days (Tue–Sun), two Google booking URLs, summary match strings. Pattern mirrors SLA settings.
- **API route:** `GET`/`PUT` appointment settings with admin permission, zod validation, merge with defaults.
- **Settings UI:** `/settings/appointments` under General in settings nav + breadcrumbs; form for all editable fields; toast on save. Secrets not shown (env only).
- No `appointment_reminders` table or cron in this slice — settings-only vertical slice.

## Acceptance criteria

- [ ] CONTEXT.md contains Appointment domain terms consistent with existing glossary style.
- [ ] Default settings match locked plan values (venue, 60 min, Tue–Sun, 10:00–18:00, both booking URLs, provisional summary strings).
- [ ] `GET` returns merged settings; `PUT` persists to `site_settings` and rejects invalid input.
- [ ] `/settings/appointments` appears under General in settings sidebar; breadcrumbs resolve.
- [ ] Operator can save venue, duration, hours, days, URLs, and match strings; values survive reload.
- [ ] No WhatsApp or Google secrets exposed in UI or `site_settings`.

## Blocked by

None — can start immediately.
