# OPS checklist: Google review replies

Everything below happens outside the code. Steps 1–2 are the slow part (Google's review); the shop
review cards and the Telegram access tab work as soon as the migration is applied (steps 7–8).
Until step 1 is approved, Google reviews come through the Places API (step 0).

**Where it stands:** Settings → Users & permissions → Telegram → **Google Maps reviews** checks all
of this live and says which step is missing.

## 0. Until Google approves: the Places API

Nothing to set: it uses the landing page's `GOOGLE_MAPS_API_KEY` and `GOOGLE_PLACE_ID`, and runs
from the daily `results-sla` cron, reading once a week. It stands down by itself once
`GOOGLE_BUSINESS_*` is set (step 4).

- **Budget.** One billed Place Details Enterprise + Atmosphere read a week (1,000 free a month,
  shared with the landing page's weekly read). Capped at 60 reads a month by default;
  `GOOGLE_PLACES_POLL_MONTHLY_CAP` changes it, up to 500. Usage: Google Cloud Console → Google Maps
  Platform → Metrics, or the Telegram tab.
- **The key** must be allowed to call Places API (New) from the server. If it is restricted to HTTP
  referrers, `GOOGLE_MAPS_API_REFERRER` must match an allowed referrer (as for the landing page).
- **Run it now** (still counted against the cap):

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://custom.mpillow.com/api/cron/google-places-reviews
  ```

- Cards from Places are answered on Google Maps, then **Mark replied**. Places shows only five
  reviews; others arrive as a "didn't come through as a card" note with a link.

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

Prod uses Workload Identity Federation — no API key in Vercel. The function's `x-vercel-oidc-token`
is exchanged for a short-lived Anthropic token.

1. Claude Console → Settings → **Workload identity** → **Connect workload** → **Custom OIDC**:
   - Issuer: name `vercel-mp-inv`, URL `https://oidc.vercel.com/ivanyeors-projects`, JWKS: OIDC
     discovery, single-use (JTI) **off** (Vercel tokens carry no `jti` and are reused for up to
     90 min), max token lifetime **2 h** (function tokens live 2 h).
   - Rule match: audience `https://api.anthropic.com` (the code asks Vercel for that audience),
     subject prefix `owner:ivanyeors-projects:project:mp-inv:environment:production`,
     claim `project_id` = `prj_74SAGUQsw4QgeSqWVIwDAopbt0p9`
   - Scope `workspace:developer`, token lifetime 3600 s, service account for the workspace to bill.
   - Test step waits 15 min for an exchange: set the env vars below, redeploy, then Settings →
     Telegram access → Send preview triggers one. The test can be re-run from the rule page.
2. Vercel env (plain, not secret): `ANTHROPIC_FEDERATION_RULE_ID` (`fdrl_…`),
   `ANTHROPIC_ORGANIZATION_ID`, `ANTHROPIC_SERVICE_ACCOUNT_ID` (`svac_…`),
   `ANTHROPIC_WORKSPACE_ID` (`wrkspc_…`). Redeploy. Do not set `ANTHROPIC_API_KEY` in prod — the
   SDK prefers it and federation is bypassed.
3. Denied exchanges show the reason under Workload identity → authentication history.

Local scripts (`scripts/*.ts`) have no Vercel token: put an `ANTHROPIC_API_KEY` in `.env.local`.
Without either, cards still arrive — with "No draft yet" — and staff can reply with their own wording.

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

Apply `supabase/migrations/20261002060000_google_review_replies.sql`,
`20261002070000_google_review_reopen.sql` and `20261028035135_google_reviews_places_source.sql`
(`pnpm db:push` applies them in order).

## 8. Telegram access

1. Settings → Staff Management → **Telegram access** (owners/admins).
2. Add each person with a role (**Review manager** or **Shop moderator**) → copy the
   `/link CODE` shown (it is shown once; "New code" issues another).
3. They send it to the bot — in a private chat with the bot, or in the measurements group. If the
   bot is in privacy mode and ignores a plain `/link` in the group, use `/link@<bot_username> CODE`
   or send it privately.
4. The first sync after setup posts cards for unanswered reviews from the last 14 days; older ones
   are recorded as `backlog` without a card. To card every unanswered review regardless of age:

   ```bash
   npx tsx --env-file=.env.local scripts/google-reviews-backfill.ts --dry-run   # list, change nothing
   npx tsx --env-file=.env.local scripts/google-reviews-backfill.ts             # card them, newest first
   ```

## 9. Preview the cards in Telegram

Settings → Staff Management → Telegram access → **Send preview** posts sample cards to the
measurements group: a thank-you, a constructive and a service-recovery reply, a reopened review, a
card after Post, and a shop review. Nothing is stored or posted to Google, and every card says
PREVIEW. Tapping a button on a preview card tells that person whether they are set up, and as
what — a quick check after everyone has sent `/link`. With Claude configured (§5), the sample
replies are real Claude drafts.

From a terminal instead (needs `TELEGRAM_BOT_TOKEN` in `.env.local`):

```bash
npx tsx --env-file=.env.local scripts/telegram-review-preview.ts             # send to the group
npx tsx --env-file=.env.local scripts/telegram-review-preview.ts --dry-run   # print, send nothing
```

## Troubleshooting

- **Tapping a button says "not set up"** — the message shows the person's Telegram ID; add them in
  Telegram access and have them `/link`.
- **Card says "Google posting isn't connected yet"** — `GOOGLE_BUSINESS_*` env is missing.
- **"Google did not take the reply"** — the reason from Google is on the card; edit by replying to
  the card, then Post again.
- **No cards for Google reviews** — open the Telegram tab's **Google Maps reviews** card first. Or
  run the manual sync above and read its JSON: `skipped: "not_configured"` means env; a 403/429
  means API approval or quota. Until approval, the Places run's JSON says `skipped: "not_due"`
  (read less than a week ago), `"monthly_cap"`, or the Places error.
