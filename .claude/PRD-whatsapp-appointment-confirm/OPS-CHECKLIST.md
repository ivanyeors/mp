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

### Issue / re-issue the admin@ refresh token (calendar + contacts)

1. Google Cloud → APIs & Services → enable **Calendar API** and **People API** on the
   project that owns `GOOGLE_OAUTH_CLIENT_ID`.
2. Open https://developers.google.com/oauthplayground → gear → **Use your own OAuth
   credentials** → paste `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.
   (The client must list `https://developers.google.com/oauthplayground` as an
   authorised redirect URI.)
3. Select **both** scopes, nothing else:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/contacts`
4. **Authorize APIs** → sign in as **`admin@mpillow.com`** → Accept every checkbox.
5. **Exchange authorization code for tokens** → copy `refresh_token`.
   No `refresh_token` in the response? https://myaccount.google.com/permissions →
   remove the app for `admin@` → repeat from step 4.
6. Vercel → Project → Settings → Environment Variables → `GOOGLE_OAUTH_REFRESH_TOKEN`
   (Production) → replace → **Redeploy** the latest production deployment (env changes
   only apply to new deployments). Update `.env.local` too.
7. Keep the OAuth app **Published** — Testing-mode refresh tokens expire after ~7 days.

Smoke: signed in as staff, open `/api/settings/appointments/google-status`. It reports
the token's scopes, the account, and live Calendar + People probes; `ok: true` means
the grant is complete, otherwise `nextStep` names the fix. Then book a test
appointment and check `contact` in the response.

### Google Contacts sync (admin@mpillow.com)

Guests are synced into that account's Google Contacts (search by phone, then email →
create if new, update if name/phone/email differ, skip if identical) at two points:

- **On booking** — `/api/appointments/book` syncs right after `events.insert`; the
  response carries `contact: created | updated | skipped | failed`. Failure never
  blocks the booking (logged server-side).
- **Daily sweep** — `/api/cron/appointment-reminders` chains a sweep of every
  appointment in the next 30 days, so events staff add straight into Google Calendar
  (name + phone in the description, guest as attendee) get a contact too. Manual run
  / backfill: `GET /api/cron/contacts-sync?days=90` with `Authorization: Bearer $CRON_SECRET`.

### Re-issue when Calendar returns `invalid_rapt`

Symptom: Settings appointments / cron fail with `invalid_grant` + `error_subtype: invalid_rapt` (https://support.google.com/a/answer/9368756).

1. Re-consent in OAuth Playground as **`admin@mpillow.com`** with calendar + contacts only (no Drive).
2. Update `GOOGLE_OAUTH_REFRESH_TOKEN` in `.env.local` **and** Vercel (Production; Preview too if cron/settings run there). Leave `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN` alone.
3. Restart local `next dev` so it reloads env.
4. To reduce recurrence (Workspace admin): lengthen Google Cloud session / reauth policy, or mark this OAuth client as a **trusted app** and exempt trusted apps from reauth. Keep the OAuth app **Published** (Testing-mode refresh tokens expire ~7 days).

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
