# Slice 07 — Google Contacts upsert on reminder send

Type: AFK
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 17–18

## What to build

On each day-before reminder send, upsert guest name and phone into Google Contacts via People API so WhatsApp Business app displays names.

- **`google-contacts` module:** search-by-phone; create or update contact with display name + E.164 mobile for `admin@mpillow.com` account.
- Hook into cron send path (after successful WhatsApp send or in parallel with send).
- Persist name + phone on `appointment_reminders` row (already in schema from slice 03).
- Failure to upsert contact should log error but not block WhatsApp send (contacts are best-effort enhancement).

Demoable outcome: after day-before send, contact appears in Google Contacts; WhatsApp Business thread shows guest name (after contact sync).

## Acceptance criteria

- [ ] Day-before send triggers People API upsert with guest name and normalized phone.
- [ ] Existing contact with same phone gets display name updated if changed.
- [ ] New contact created when phone not found.
- [ ] Contact upsert failure logged; WhatsApp send still succeeds.
- [ ] Reminder row retains name + phone for audit.
- [ ] Manual check: guest name visible in WhatsApp Business app thread after Google Contacts sync (documented in slice 08 checklist).

## Blocked by

- Slice 03 (day-before send path exists)
- Slice 01 (People API OAuth scope and consent)
