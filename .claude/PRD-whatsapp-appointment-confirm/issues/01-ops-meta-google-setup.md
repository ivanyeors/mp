# Slice 01 — Ops: Meta WABA + English templates + Google OAuth + Event JSON dump

Type: HITL
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 36, 37, 40

## What to build

Complete manual infrastructure setup and document the ops checklist so engineering slices can run against live Meta and Google credentials.

- **Meta WhatsApp Cloud API** on `+65 8780 5311` with **Business app coexistence** (same inbox as WhatsApp Business app).
- **System user token** with `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`.
- **Approve English utility templates** (names recorded in env constants for engineering):
  - Day-before: body with date/time/type; quick replies **Confirm** / **Reschedule**.
  - Morning-of: friendly see-you message with date/time/place (no buttons).
  - Cancel: cancelled + matching rebook link (template outside 24h window; service text inside window when applicable).
- **Google Cloud** project for `admin@mpillow.com`: enable Calendar API + People API; OAuth client; one-time consent; store refresh token in Vercel env (scopes: calendar + contacts).
- Confirm phone syncs Google Contacts for that account so WhatsApp shows names.
- **Dump one real Customisation + Re-adjustment Event JSON** from primary calendar to lock summary match strings (`Mpillow Customisation` / `Mpillow Re-adjustment` provisional).
- Document step-by-step checklist in repo or issue comment for slice 08 signoff.

## Acceptance criteria

- [ ] WABA coexistence active on `+65 8780 5311`; test message visible in Business app inbox.
- [ ] All three English utility templates submitted and **approved** in Meta Business Manager.
- [ ] Google OAuth refresh token stored in staging/prod env; Calendar `events.list` on `primary` succeeds for `admin@mpillow.com`.
- [ ] People API scope included in consent; test contact search/upsert succeeds.
- [ ] Sample Customisation and Re-adjustment event JSON captured; summary match strings confirmed or corrected in settings defaults.
- [ ] Env vars documented in `.env.example`: Google OAuth, calendar id, WhatsApp token/phone-number-id/verify-token/app-secret, template name envs, `CRON_SECRET`, optional `WHATSAPP_ALLOWLIST`.
- [ ] Webhook URL registered in Meta app (verify token matches env).

## Blocked by

None — can start immediately.
