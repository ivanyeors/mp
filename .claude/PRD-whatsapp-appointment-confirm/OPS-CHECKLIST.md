# Ops checklist — WhatsApp appointment confirm

HITL slices 01 + 08. Complete before relying on staging/prod automation.

## 1. Meta WhatsApp Cloud API

1. Business portfolio owns WABA for `+65 8780 5311`.
2. Enable **WhatsApp Business app coexistence** so Cloud API and the phone app share one inbox.
3. Create a **system user** token with:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
4. Note **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
5. Set `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` (App → Settings → Basic).
6. Webhook callback URL: `https://<host>/api/webhooks/whatsapp`
   - Verify token must match `WHATSAPP_VERIFY_TOKEN`.
   - Subscribe to `messages`.

## 2. English utility templates (approve in Business Manager)

Record exact names in env (defaults below):

| Env | Default name | Purpose |
|-----|--------------|---------|
| `WHATSAPP_TEMPLATE_DAY_BEFORE` | `appointment_day_before` | Body: guest, date, time, type. Buttons: **Confirm** / **Reschedule** |
| `WHATSAPP_TEMPLATE_MORNING_OF` | `appointment_morning_of` | Body: guest, date, time, venue. No buttons |
| `WHATSAPP_TEMPLATE_CANCEL` | `appointment_cancelled` | Body: type, rebook URL (used outside 24h window) |

Body parameter order must match `lib/appointments/whatsapp.ts` (positional).

## 3. Google OAuth (Calendar + People)

1. Google Cloud project; enable **Calendar API** + **People API**.
2. OAuth client (Web or Desktop); consent as `admin@mpillow.com`.
3. Scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/contacts`
4. Store refresh token → `GOOGLE_OAUTH_REFRESH_TOKEN` (+ client id/secret).
5. `GOOGLE_CALENDAR_ID=primary`.
6. Confirm the Business phone syncs Google Contacts for that account (names in WhatsApp).

### One-time refresh token (example)

```bash
# After OAuth consent, exchange code for refresh_token and paste into Vercel env.
```

Smoke: `events.list` on primary for tomorrow; People `searchContacts` by a test phone.

## 4. Dump sample Events (lock summary strings)

Export one real **Customisation** and one **Re-adjustment** Event JSON from primary.
Confirm summary substrings (defaults in Settings → Appointments):

- `Mpillow Customisation`
- `Mpillow Re-adjustment`

Update `/settings/appointments` if Google titles differ.

## 5. Vercel / env

Set on staging then production (see `.env.example`):

- `CRON_SECRET`
- Google OAuth + `GOOGLE_CALENDAR_ID`
- WhatsApp token / phone-number-id / verify / app-secret / template names
- Staging: `WHATSAPP_ALLOWLIST=+65…` (your test numbers only)

Apply migration: `appointment_reminders` (`supabase/migrations/20260709120000_appointment_reminders.sql`).

Crons in `vercel.json`:

- `/api/cron/appointment-reminders` → `0 1 * * *` (09:00 SGT)
- `/api/cron/results-sla` → `0 2 * * *`

If Hobby rejects a second cron at deploy, chain a fetch to appointment-reminders from the SLA route as last resort.

## 6. Staging E2E signoff

1. Seed/adjust Settings → Appointments (venue, hours, URLs, match strings).
2. Book a test Customisation slot for **tomorrow** with an allowlisted phone.
3. Trigger cron:  
   `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/appointment-reminders`
4. Expect day-before WhatsApp; row in `appointment_reminders` status `reminded`.
5. Tap **Confirm** → status `confirmed`; calendar unchanged.
6. Book another slot; cron; tap **Reschedule** → pick a list slot → calendar patched; status `rescheduled`.
7. Another flow: Reschedule → reply `none of these` → event deleted; cancel WA with correct rebook link.
8. Silent path: day-before with no reply → next morning cron → `morning_sent`; no further messages.
9. Confirm Google Contact upsert + name visible in Business app after sync.

## 7. Production cutover

- Remove or empty `WHATSAPP_ALLOWLIST` (ignored in production anyway).
- Confirm coexistence still shows Cloud API messages in the phone app.
- Monitor cron JSON `{ scanned, reminded, morning, skipped, errors }`.
