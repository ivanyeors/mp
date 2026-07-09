# PRD: WhatsApp Appointment Confirm

Status: Draft (needs-triage)
Source: Plan `whatsapp-appointment-confirm` (`.cursor/plans/whatsapp_appointment_confirm_b569b58b.plan.md`)

## Problem Statement

Customers book Customisation and Re-adjustment appointments through Google Appointment Scheduling, but we have no automated way to confirm attendance, offer rescheduling, or follow up when they do not reply. Staff must manually chase guests by phone or WhatsApp, and calendar events can sit unconfirmed until the day of the visit.

When a guest wants a new time, staff must manually find free slots, update the calendar, and message back. Cancellations are not tied to a clear rebook path. Guest names may not appear correctly in the WhatsApp Business inbox because Google Contacts is not kept in sync with booking phone numbers.

Operators also lack a single place to configure venue, business hours, bookable days, appointment duration, and the Google booking links used in cancel messages — these values are implicit or hard-coded today.

## Solution

A backend-only daily job reads tomorrow's and today's appointments from the `admin@mpillow.com` Google Calendar, sends WhatsApp utility templates to guests with valid phone numbers, and handles Confirm / Reschedule / Cancel replies through a webhook state machine.

- **Day-before:** English utility template with quick-reply buttons **Confirm** and **Reschedule**.
- **Confirm:** mark confirmed; no calendar change.
- **Reschedule:** offer three clash-free slots from `freeBusy` and business rules; on pick, patch the calendar event and send a confirmation message.
- **Second reject:** delete/cancel the calendar event and send a cancel message with the matching Google rebook link (Customisation or Re-adjustment).
- **No reply to day-before:** one morning-of friendly message (no buttons) on appointment day; if still silent, stop — no auto-cancel.
- **Contacts:** upsert guest name + phone into Google Contacts on each reminder send so WhatsApp shows names in the Business app inbox.
- **Settings:** `/settings/appointments` under General for venue, duration, hours, bookable days, booking URLs, and summary match strings (secrets stay in env).

No Order or Customer journey linking in v1 — only a thin appointment reminder log.

## User Stories

1. As a guest who booked a Customisation appointment, I want a WhatsApp message the day before with my date, time, and appointment type, so that I know my booking is still on.
2. As a guest who booked a Re-adjustment appointment, I want the same day-before reminder with the correct appointment type, so that I am not confused about what I booked.
3. As a guest, I want to tap **Confirm** in WhatsApp to confirm my attendance, so that I do not need to call or email.
4. As a guest, I want to tap **Reschedule** when I cannot make my slot, so that I can pick a new time without staff involvement.
5. As a guest who tapped Reschedule, I want to see three available alternative times, so that I can choose one quickly.
6. As a guest who picked a new slot, I want a WhatsApp message confirming my new date and time, so that I have a record of the change.
7. As a guest who rejected the offered slots, I want my appointment cancelled and a link to rebook, so that I can book again when ready.
8. As a guest who did not reply to the day-before message, I want a friendly morning-of reminder with date, time, and venue, so that I still know when and where to come.
9. As a guest who still does not reply after the morning-of message, I want no further automated messages, so that I am not spammed.
10. As a guest, I want the venue address in messages to match the calendar event location when set, so that I go to the right place.
11. As a guest, I want the venue to fall back to the configured default address when the event has no location, so that I always see where to go.
12. As a guest who rescheduled, I want my Google Calendar event updated to the new time, so that my calendar invite reflects reality.
13. As a guest who cancelled via the flow, I want my calendar event removed or cancelled, so that I do not show up to a slot I gave up.
14. As a guest, I want the rebook link in a cancel message to match my appointment type (Customisation vs Re-adjustment), so that I land on the right booking page.
15. As a guest, I want my phone number normalized correctly from common Singapore formats, so that I receive messages even if I typed `87805311` or `+65 8780 5311`.
16. As a guest with an invalid phone on the booking form, I want staff to handle me manually (no broken automation), so that the system does not send to a bad number.
17. As a staff member using the WhatsApp Business app on `+65 8780 5311`, I want guest names to appear in threads, so that I know who I am talking to.
18. As a staff member, I want guest name and phone upserted to Google Contacts when a reminder is sent, so that WhatsApp can display names via synced contacts.
19. As a staff member, I want Cloud API and the Business app to share the same inbox (coexistence), so that I can reply manually when needed.
20. As a store operator, I want to configure the default venue address, so that messages show our studio location when events lack a location.
21. As a store operator, I want to configure appointment duration, open/close hours, and bookable days, so that offered reschedule slots match real availability.
22. As a store operator, I want to configure the two Google booking URLs (Customisation and Re-adjustment), so that cancel messages point to the right rebook pages.
23. As a store operator, I want to configure summary match strings for event titles, so that type detection stays correct if Google naming changes slightly.
24. As a store operator, I want appointment reminder settings stored in site settings (like SLA settings), so that I edit them in the admin UI without redeploying.
25. As a store operator, I want WhatsApp and Google OAuth secrets to remain in environment variables only, so that credentials are not stored in the database.
26. As a developer, I want a daily cron at 09:00 SGT that processes tomorrow's day-before reminders and today's silent morning-of follow-ups, so that one job covers both windows on Vercel Hobby.
27. As a developer, I want cron routes protected by `CRON_SECRET` Bearer auth, so that only scheduled invocations run the job.
28. As a developer, I want reminder sends idempotent per calendar event and message kind, so that retries do not duplicate WhatsApp messages.
29. As a developer, I want non-production environments to support a phone allowlist, so that staging does not message real customers.
30. As a developer, I want an `appointment_reminders` table keyed by `calendar_event_id`, so that state survives across cron runs and webhook replies.
31. As a developer, I want statuses `pending`, `reminded`, `confirmed`, `offering_slots`, `rescheduled`, `cancelled`, `morning_sent`, and `skipped_invalid_phone`, so that every path is auditable.
32. As a developer, I want calendar events filtered to those with guest name + valid phone, not cancelled, and not all-day, so that internal or malformed events are skipped.
33. As a developer, I want appointment type inferred from event summary against configurable match strings, so that Customisation and Re-adjustment flows diverge correctly.
34. As a developer, I want reschedule slots computed via Calendar `freeBusy` plus business rules (60 min, Tue–Sun, 10:00–18:00 last start, Asia/Singapore, ~14 day lookahead, 3 slots), so that offered times are actually bookable.
35. As a developer, I want a WhatsApp webhook that verifies Meta signatures and handles button/list replies, so that inbound actions drive the state machine.
36. As a developer, I want approved English utility templates for day-before, morning-of, and cancel (template outside 24h window; service text inside window when applicable), so that messaging complies with WhatsApp policy.
37. As a developer, I want Google Calendar OAuth as `admin@mpillow.com` with Calendar + People API scopes, so that we read/write events and upsert contacts.
38. As a developer, I want domain glossary terms for Appointment, Appointment reminder, and schedule types in CONTEXT.md, so that future work uses consistent language.
39. As a developer, I want unit tests on phone normalization, slot carving, summary-to-link resolution, and state transitions, so that core logic is verifiable without live APIs.
40. As an operator running staging signoff, I want a step-by-step checklist (Meta app → templates → coexistence → Google OAuth → env → webhook URL → seed settings → test booking → cron → tap Confirm/Reschedule), so that I can verify the full flow before production.

## Implementation Decisions

Modules to build or modify (favoring deep, isolated, testable modules):

- **`appointment-phone` (deep module):** normalize and validate guest phone numbers to E.164 with Singapore-friendly parsing (`87805311`, `8780 5311`, `+65…`, `65…` → `+65…`). Invalid numbers yield `skipped_invalid_phone` and no WhatsApp send. Non-production environments honor an optional allowlist env var; production has no allowlist gate.
- **`appointment-type` (deep module):** given event summary and configurable match strings from settings, resolve appointment type (Customisation vs Re-adjustment) and the matching rebook URL. Fallback to Customisation URL when type is unclear.
- **`appointment-slots` (deep module):** given `freeBusy` busy intervals and business rules (duration 60 minutes, bookable days Tue–Sun, open 10:00–18:00 SGT with last bookable start at 18:00, ~14-day lookahead), return up to three non-overlapping candidate start times. Timezone: `Asia/Singapore`.
- **`appointment-reminder-state` (deep module):** pure state machine. Input: current status + inbound action (confirm, request reschedule, slot picked, slots rejected, morning-of eligible). Output: next status + side-effect intents (send template, offer interactive list, patch event, delete event, upsert contact). Statuses: `pending`, `reminded`, `confirmed`, `offering_slots`, `rescheduled`, `cancelled`, `morning_sent`, `skipped_invalid_phone`.
- **`appointment-settings`:** parse and store appointment configuration in `site_settings` (venue default `512 Chai Chee Lane Singapore 469028 #02-10`, duration, open/close hours, bookable days, two booking URLs, summary match strings). Pattern mirrors SLA settings: typed parse/store helpers, dedicated GET/PUT API route, client settings page under General. Venue in outbound messages prefers calendar event `location` when set, else settings venue.
- **`google-calendar`:** OAuth refresh-token client for `admin@mpillow.com`. List events on `primary` calendar for tomorrow (SGT day boundaries) and today. Filter: not cancelled, not all-day, parseable phone + guest name. Operations: `freeBusy`, `events.patch` (reschedule), `events.delete` or cancel (second reject). No dedicated Google Bookings API — Calendar Events API only.
- **`google-contacts`:** on each reminder send, People API search-by-phone upsert with guest display name and mobile. Depends on Business phone syncing `admin@mpillow.com` Google Contacts for WhatsApp name display.
- **`whatsapp`:** thin Cloud API client — send approved utility template (day-before with Confirm/Reschedule quick replies), interactive list (three slots inside 24h window after Reschedule), service text or cancel template as policy requires. Webhook: Meta verify token on GET; POST verifies `X-Hub-Signature-256` with app secret; routes button/list payloads to state machine. Phone number `+65 8780 5311` with Business app coexistence. System user token scopes: `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`.
- **Orchestration:** cron route (`GET`/`POST`, `runtime = nodejs`, `CRON_SECRET` Bearer) runs daily at `0 1 * * *` UTC (09:00 SGT). Single job: tomorrow → day-before templates; today + still `reminded` (no confirm/reschedule) → morning-of template. Webhook route handles inbound replies. Idempotent sends keyed by `calendar_event_id` + message kind. Persist offered slot ids and WhatsApp message ids on reminder rows.

Schema changes:

- New `appointment_reminders` table keyed by `calendar_event_id`: phone, name, type, `starts_at`, status, offered slot metadata, WhatsApp message ids, timestamps.
- New `site_settings` keys for appointment configuration (venue, duration, hours, days, booking URLs, summary match strings).

API contracts:

- `GET`/`PUT` appointment settings route (admin permission, zod validation, merge with defaults).
- `GET`/`POST` cron appointment-reminders route (Bearer `CRON_SECRET`).
- WhatsApp webhook `GET` (verify challenge) and `POST` (inbound messages).
- Second cron entry in deployment config; if Hobby plan caps at one cron, invoke appointment job from existing SLA cron as last resort.

Manual setup (ops, before/alongside code):

- Meta WABA on `+65 8780 5311` with coexistence; approve English utility templates (names in env constants).
- Google Cloud: Calendar + People APIs; OAuth consent for `admin@mpillow.com`; refresh token in env.
- Dump one real Customisation and Re-adjustment event JSON to lock summary match strings (`Mpillow Customisation` / `Mpillow Re-adjustment` provisional).
- Configure webhook URL, env on Vercel, seed settings, book test slot.

Architectural decisions:

- v1 is reminder-only — no Order, Customer, or Result linking.
- English templates only; no Chinese in v1.
- No rebuild of booking UI; existing Google Appointment Scheduling iframe remains.
- Staff manual calendar events with a phone typed in may false-positive into the flow; accepted for v1.
- Completing Google booking with required phone = consent for appointment-related WhatsApp only.
- After morning-of with no reply: no further automation and no auto-cancel.

## Testing Decisions

What makes a good test: assert external, observable behavior (inputs/outputs), not HTTP client internals. Prefer small vitest tests consistent with `lib/sla-reminders/__tests__/` and `lib/result-lifecycle/__tests__/`.

Modules to test (recommended minimum):

- **`appointment-phone`:** SG format variants normalize to `+65…`; invalid inputs rejected; allowlist behavior in non-prod.
- **`appointment-slots`:** slots respect duration, bookable days, 10:00–18:00 last-start rule, no overlap with busy intervals, max three results, ~14-day cap.
- **`appointment-type`:** summary + settings match strings → correct type and rebook URL; fallback to Customisation URL.
- **`appointment-reminder-state`:** transitions for confirm, offer slots, slot picked → rescheduled, second reject → cancelled, morning-of only when `reminded` and silent, invalid phone → `skipped_invalid_phone`.

Not unit-testing Google Calendar or WhatsApp HTTP wrappers beyond thin stubs; staging E2E (slice 08) covers live integration.

Prior art: `lib/sla-reminders/__tests__/sla-reminders.test.ts` (planner pure logic), `lib/result-lifecycle/__tests__/result-lifecycle.test.ts` (state transitions).

Optional later: settings parse round-trip test if schema grows; cron planner integration test with mocked calendar list.

## Out of Scope

- Booking ↔ Order / Customer / Result journey mapping (deferred).
- Chinese or multilingual WhatsApp templates.
- Rebuilding the storefront book-appointment UI or replacing Google Appointment Scheduling.
- Dedicated Google "Bookings API" (does not exist — Calendar Events only).
- Video vs in-person appointment copy variants (address-only messaging for v1).
- Dedicated bookings calendar ID (use `primary` + summary/phone filter).
- CRM verified-phones table or production phone allowlist.
- Per-slot "exactly 24 hours before" cron (Hobby daily batch instead).
- Auto-cancel when guest remains silent after morning-of.
- Writing directly to WhatsApp Business app address book via non-Cloud API.
- `reminded_no_reply` as a separate reporting status (use `reminded` + morning-of eligibility).

## Further Notes

- Template names are TBD in env/code constants until Meta approval completes.
- Verify Vercel Hobby allows two crons at deploy; fallback: chain from SLA cron.
- Ops checklist is the deliverable for slice 01 and signoff slice 08.
- Recommended build order: 01 (ops) and 02 (settings/glossary) in parallel → 03 (day-before + confirm) → 04–07 (reschedule, cancel, morning-of, contacts) → 08 (staging E2E).
- Env (illustrative): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID=primary`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, template name envs, `CRON_SECRET`, `WHATSAPP_ALLOWLIST` (non-prod).
