# OPS checklist: Google review replies

Everything below happens outside the code. Steps 1–2 are the slow part (Google's review); the shop
review cards and the Telegram access tab work as soon as the migration is applied (steps 7–8).

## 1. Business Profile API access (Google approval)

1. Google Cloud Console → the project that owns `GOOGLE_OAUTH_CLIENT_ID` → APIs & Services →
   **My Business Account Management API** → **Quotas**.
   - **0 requests/minute** → not approved. Apply at
     https://support.google.com/business/contact/api_default → "Application for Basic API Access",
     **from sg@mpillow.com** (an owner/manager of the profile), with this Cloud project number.
     Requirements: profile verified and active 60+ days, website listed on the profile.
     Google says requests are reviewed within 14 days.
   - **300 requests/minute** → approved.
2. Enabling "Places API (New)" or "Business Profile Performance API" does **not** give review
   access — those are different APIs.

## 2. Enable the APIs (same Cloud project)

- My Business Account Management API
- My Business Business Information API
- My Business Notifications API
- Google My Business API (the v4 reviews API — only listed once access is approved)
- Cloud Pub/Sub API

## 3. Refresh token for sg@mpillow.com

1. https://developers.google.com/oauthplayground → gear → **Use your own OAuth credentials** →
   the existing client id/secret. (The client must list
   `https://developers.google.com/oauthplayground` as an authorised redirect URI — it already does
   if the Drive/Calendar tokens were issued this way.)
2. Scope: `https://www.googleapis.com/auth/business.manage` → Authorize → sign in as
   **sg@mpillow.com** → Exchange authorization code for tokens.
3. Copy the **refresh token** → Vercel env `GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN` (and `.env.local`).
   Keep it separate from `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`.

## 4. Find the location and test a read

```bash
npx tsx --env-file=.env.local scripts/google-business-setup.ts
```

It prints the token's scopes, every account and location, and a line like
`GOOGLE_BUSINESS_LOCATION=accounts/123/locations/456` → set that in Vercel and `.env.local`, run
again, and it reads the five newest reviews. A "0 quota" error means step 1 is not done.

## 5. Claude

Vercel env `ANTHROPIC_API_KEY` (an Anthropic API key for the workspace that should be billed).
Without it, cards still arrive — with "No draft yet" — and staff can reply with their own wording.

## 6. Pub/Sub (real-time)

1. `openssl rand -hex 32` → Vercel env `GOOGLE_REVIEWS_PUSH_TOKEN`.
2. Pub/Sub → **Create topic** `gbp-reviews` (no default subscription needed).
3. Topic → Permissions → add principal `mybusiness-api-pubsub@system.gserviceaccount.com` with
   role **Pub/Sub Publisher**.
4. **Create subscription** on the topic → Delivery type **Push** → endpoint
   `https://custom.mpillow.com/api/webhooks/google-reviews?token=<GOOGLE_REVIEWS_PUSH_TOKEN>` →
   acknowledgement deadline 60s → retry policy "exponential backoff".
5. Point the Business Profile at the topic:

   ```bash
   npx tsx --env-file=.env.local scripts/google-business-setup.ts --notify projects/<gcp-project-id>/topics/gbp-reviews
   ```

The daily `results-sla` cron also syncs (up to 3 new cards per run), so a missed notification is
picked up within a day. Manual sync any time:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://custom.mpillow.com/api/cron/google-reviews-sync
```

## 7. Database

Apply `supabase/migrations/20261002060000_google_review_replies.sql` (`pnpm db:push`).

## 8. Telegram access

1. Settings → Staff Management → **Telegram access** (owners/admins).
2. Add each person with a role (**Review manager** or **Shop moderator**) → copy the
   `/link CODE` shown (it is shown once; "New code" issues another).
3. They send it to the bot — in a private chat with the bot, or in the measurements group. If the
   bot is in privacy mode and ignores a plain `/link` in the group, use `/link@<bot_username> CODE`
   or send it privately.
4. The first sync after setup posts cards for unanswered reviews from the last 14 days; older ones
   are recorded as `backlog` without a card.

## Troubleshooting

- **Tapping a button says "not set up"** — the message shows the person's Telegram ID; add them in
  Telegram access and have them `/link`.
- **Card says "Google posting isn't connected yet"** — `GOOGLE_BUSINESS_*` env is missing.
- **"Google did not take the reply"** — the reason from Google is on the card; edit by replying to
  the card, then Post again.
- **No cards for Google reviews** — run the manual sync above and read its JSON: `skipped:
  "not_configured"` means env; a 403/429 means API approval or quota.
