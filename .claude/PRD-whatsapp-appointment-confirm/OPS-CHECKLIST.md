# Ops checklist — WhatsApp appointment confirm

HITL slices 01 + 08. Complete before relying on staging/prod automation.

## 0. Two numbers, different jobs

| Number | Role | Where it lives |
|--------|------|----------------|
| `+1 555-334-8954` (today) | **Utility sender.** Automated Cloud API line: sends appointment templates, receives Confirm / Reschedule button replies. No person reads it. | `WHATSAPP_PHONE_NUMBER_ID` |
| `+65 8780 5311` | **Staffed sales line.** What customers see and chat to. Never used by the Cloud API. | `NEXT_PUBLIC_SUPPORT_WHATSAPP` (`lib/contact.ts`) |

These are separate on purpose — do not sync them. Publishing the utility number
in customer-facing copy starts conversations nobody reads: the webhook only
understands Confirm, Reschedule, a picked time, "none of these" and "cancel".
Anything else a guest sends (text, photo, voice note) gets one auto-reply per 12
hours pointing at the sales line, and goes no further. Every one of those
answers something — a tap that cannot apply (a list that has closed, an
appointment already over) says so and points at the sales line.

The webhook acts only on messages addressed to `WHATSAPP_PHONE_NUMBER_ID`, so
putting the sales line on the same WABA later cannot make the bot answer it.

## 0.5 Prove the sender reaches guests

Every new Meta app is provisioned a test number on the reserved `+1 555-…`
prefix, named "Test Number". It reports GREEN quality and `CLOUD_API`, so every
health signal reads fine — but it only delivers to the short recipient list in
WhatsApp → API Setup. Sends to anyone else fail with `#131030`.

A `+1 555` number is not automatically that test number: one can carry the
business's own verified name and a normal messaging tier. Neither the prefix nor
the tier settles it, and your own phone proves nothing, because it is almost
certainly on the recipient list. The proof is a send to a phone that is **not**
on that list:

    npx tsx --env-file=.env.local scripts/whatsapp-test.ts +65XXXXXXXX

`scripts/whatsapp-preflight.ts` blocks when the sender is named "Test Number" and
warns on the `+1 555` prefix alone.

A token that cannot reach any WABA by any route is usually the matching symptom:
the temporary token on that same API Setup page expires in 24 hours and is not
what production should carry. Production wants a system-user token.

## 1. Meta WhatsApp Cloud API

1. Business portfolio owns the WABA for the **utility sender** `+65 8809 7571`.
2. Enable **WhatsApp Business app coexistence** on it so a human can still see
   stray free-text replies that the webhook ignores.
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
| `WHATSAPP_TEMPLATE_DAY_BEFORE` | `appointment_day_before_v2` | Body: guest, date, time, type. Buttons: **Confirm** / **Reschedule** (the original `appointment_day_before` was approved without them) |
| `WHATSAPP_TEMPLATE_MORNING_OF` | `appointment_morning_of` | Body: guest, date, time, venue. No buttons |
| `WHATSAPP_TEMPLATE_CANCEL` | `appointment_cancelled_v2` | Body: guest, type, date + time, rebook URL, sales-line number. Used when the guest has not messaged in 24h; inside that window it is free text. The original `appointment_cancelled` (type, rebook URL) still works under its exact name but cannot name the sales line |

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

## 7. Changing the sending number

The sending number lives only in `WHATSAPP_PHONE_NUMBER_ID` — nothing in the
code names a number. To move it (e.g. to `+65 8809 7571`):

1. Add and verify the number in the **same WABA** that owns the current one.
   Templates are approved per WABA, so staying in it carries all three across;
   a new WABA means re-approving `appointment_day_before_v2`,
   `appointment_morning_of`, and `appointment_cancelled_v2` from scratch.
2. Register it for Cloud API and set its 2FA PIN — **save the PIN**, it is
   required to re-register or move the number later:
   `npx tsx --env-file=.env.local scripts/whatsapp-register.ts`
3. Read the new **Phone number ID** (API Setup, or `scripts/whatsapp-discover.ts`,
   which maps every reachable WABA to its numbers and templates).
4. Update `WHATSAPP_PHONE_NUMBER_ID` in Vercel (Production **and** Preview) and
   redeploy.
5. Re-point the Meta webhook to `https://<host>/api/webhooks/whatsapp` and
   re-subscribe to `messages`. Update `WHATSAPP_VERIFY_TOKEN` /
   `WHATSAPP_APP_SECRET` if the number moved to a different Meta app.
6. Leave `NEXT_PUBLIC_SUPPORT_WHATSAPP` alone — the public number is the sales
   line and does not follow the sending number (see §0).
7. Verify the whole configuration in one pass — it checks the resolved sender,
   Cloud API registration, every template's language and param count, the
   webhook subscription, and that the public sales number is still distinct:
   `npx tsx --env-file=.env.local scripts/whatsapp-preflight.ts`
   Then send for real: `npx tsx --env-file=.env.local scripts/whatsapp-test.ts`,
   with `WHATSAPP_ALLOWLIST` set to your own number.
8. Watch the utility number's inbox for a few days. Guests who reply with free
   text instead of tapping a button get no answer — point them to the sales
   line by hand, or ask for the auto-reply fallback to be built.

## 8. Turning notifications off

Settings → Appointments → **WhatsApp** tab → **WhatsApp notifications** is the
kill switch (`appointments_whatsapp_enabled` in `site_settings`). Off silences
all three send paths:

- the booking route skips its immediate confirmation and short-notice reminder;
- the daily cron returns `{ disabled: true }` without touching Calendar or Meta;
- the inbound webhook acks without replying or mutating reminder rows.

Bookings, calendar events, and email invites are unaffected. No redeploy or env
change needed.

## 9. Production cutover

- Remove or empty `WHATSAPP_ALLOWLIST` (ignored in production anyway).
- Confirm coexistence still shows Cloud API messages in the phone app.
- Monitor cron JSON `{ scanned, reminded, morning, cancelled, skipped, errors,
  watch }`, and the failures recorded on rows (section 10).

## 10. When each message goes out

The daily run fires at 09:00 SGT (`0 1 * * *` UTC; Hobby lands anywhere in that
hour). It sends tomorrow's day-before and today's morning-of. Bookings it would
miss are reminded by the booking path itself (`missedReminder` in
`lib/appointments/state.ts`):

| Booked | Gets |
|--------|------|
| 2+ days ahead | Confirmation (if `WHATSAPP_TEMPLATE_CONFIRM` is set), day-before at 09:00, morning-of if silent |
| Tomorrow, before 09:00 | Confirmation, day-before at today's 09:00 run |
| Tomorrow, 09:00 or later | Day-before immediately (with buttons), morning-of if silent |
| Today | Morning-of immediately |
| Straight in Google Calendar after the run | Morning-of on the day (catch-up) |

A failed send writes `last_error` / `last_error_at` on the row and leaves its
status alone. A day-before that failed leaves the row `pending`, and the next
morning's run sends the morning-of instead. To see what failed:

```sql
select guest_name, starts_at, status, last_error, last_error_at
from appointment_reminders
where last_error is not null
order by last_error_at desc;
```

A send Meta accepted but could not deliver (an unreachable number, a paused
template) arrives later as a `failed` status on the webhook, and is written to
the same `last_error` — if the webhook is reaching the site (section 12).

## 11. Cancellations

However an appointment is called off, the guest gets one WhatsApp saying so,
with the rebook link and the sales line, and no reminder after it:

| Cancelled by | How the site hears |
|--------------|--------------------|
| Guest replies "cancel", or "none of these" to a list of times | The webhook, at once. The event is deleted |
| Guest answers **No** to the calendar invite | Google Calendar push, at once. The event is deleted so the slot frees up (Google emails the guest) |
| Guest cancels a Google booking, or staff delete the event in Google Calendar | Google Calendar push, at once |
| Staff cancel a Re-adjustment in Settings | That action itself |

The 09:00 run is the net under all of it: before a reminder it skips (and
cancels) a declined invite, and it asks Google about every other live upcoming
row, so a missed push is caught by the next morning at the latest. Only rows the
site knows about are covered — a booking made straight in Google Calendar has
none until the run the day before it.

The push needs a channel open (`google_calendar_channels`). The daily run opens
and renews it; to open it right after a deploy, open
`https://<host>/api/cron/calendar-watch` signed in as staff (or curl it with
`CRON_SECRET`). It answers `{ watch: { status: "renewed" | "kept", expiresAt } }`.

## 12. A guest's reply gets nothing back

Every message that reaches the webhook is recorded in `whatsapp_inbound` (the
intent and what was done, never the text):

```sql
select phone, kind, outcome, received_at
from whatsapp_inbound
order by received_at desc
limit 20;
```

Nothing there for a reply you sent means Meta never got it to the site. Run
`scripts/whatsapp-preflight.ts`: it checks the app is subscribed to the WABA,
its webhook points at `/api/webhooks/whatsapp` for `messages`, the app secret
is the one Meta signs with, and the live site accepts a POST signed with it. A
secret mismatch is silent from the guest's side; within the hour, Vercel's logs
show `[whatsapp/webhook] signature rejected`.

Point the callback at the host that serves the site, not one that redirects to
it: `work.mpillow.com` 308s everything to `custom.mpillow.com`, and Meta does not
follow redirects, so a callback on `work.` silently loses every message. The
preflight probe does not follow them either and flags a redirect.

## 13. Read every guest message on your own phone

All the free-text copy lives in `lib/appointments/messages.ts`; the template
wording in `scripts/whatsapp-create-templates.ts`. To see each one as a guest
would, labelled and in order, message the sender from your phone first (free
text needs that 24h window), then:

    npx tsx --env-file=.env.local scripts/whatsapp-preview.ts +65XXXXXXXX

It sends sample data only, but a tap on the previews is a real reply and acts on
that phone's next upcoming appointment, if it has one.
