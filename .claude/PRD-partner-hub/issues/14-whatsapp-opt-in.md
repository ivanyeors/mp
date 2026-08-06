## Parent

PRD: Partner Hub — #70

## What to build

HITL — WhatsApp channel for **Partner notifications**. Partners with WhatsApp opt in (hub settings toggle, defaulting off) to receive the same events as email — referral earned, milestone reached, payout made, terms re-accept — via the existing WhatsApp Cloud API integration. **Human-in-the-loop because each notification type needs a Meta-approved message template** (external approval latency, wording constraints) and the owner must sign off template copy and per-conversation cost.

## Status

**BUILT 2026-08-02** on feat/partner-hub (tsc-clean, 52 tests green, 2 adversarial reviews → 0 confirmed defects). Files: migration `20260802000000_partner_notify_whatsapp` (`partners.notify_whatsapp` per-partner + `partner_whatsapp` ledger), `lib/whatsapp/partner-notify.ts`, `sendTemplateMessage` in `lib/appointments/whatsapp.ts`, wired into 4 senders in `lib/email/partner.ts`, `/api/partner/notify` PATCH, `NotificationsCard` in partner settings. Remaining ops (not code): submit/approve the 4 templates in Meta + set `WHATSAPP_TEMPLATE_PARTNER_*` (+ optional `WHATSAPP_TEMPLATE_LANG`) envs; deploy the additive migration.

## Acceptance criteria

- [x] Owner signs off template wording per event (approved) — Meta submission + template-name envs are the remaining ops step
- [x] Hub settings toggle stores per-partner channel preference (email always on; WhatsApp additive)
- [x] Opted-in partner receives WhatsApp messages for the four events using their application mobile number
- [x] Opt-out stops WhatsApp immediately without touching email
- [x] Failures fall back silently to email-only (no partner-visible error)

## Blocked by

- #84
