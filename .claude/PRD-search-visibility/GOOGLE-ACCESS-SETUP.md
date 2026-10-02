# Google access setup: Search Console ingest + GA4 MCP for Claude Code

Two separate credentials with two separate jobs:

| | A. Service account | B. Your own Google login (ADC) |
|---|---|---|
| Used by | The app: daily Search Console ingest (slice 01), later the GA4 Data API (slice 08) | Claude Code **on your laptop**, via Google's `analytics-mcp` server |
| Lives in | Vercel env + `.env.local` | `~/.config/gcloud/` on your machine only |
| Access | Read-only; only the properties you add it to | Read-only (`analytics.readonly`); every GA property *you* can see |

Both use one Google Cloud project. Create it once (console.cloud.google.com → New project, e.g. `mpillow-analytics`) and note its **project ID**.

In that project, go to **APIs & Services → Library** and enable:
- **Google Search Console API** (for A)
- **Google Analytics Data API** (for A, slice 08, and B)
- **Google Analytics Admin API** (for B)

---

## A. Service account for the Search Console ingest (~10 min)

1. Cloud console → IAM & Admin → **Service accounts → Create**
   - Name `mp-search-metrics`. Grant **no** project roles; access comes from GSC/GA4, not IAM.
   - Open it → **Keys → Add key → JSON**. A file downloads; treat it like a password.
2. Search Console → property for `custom.mpillow.com` → Settings → **Users and permissions → Add user**
   - Email: the service account's `…@….iam.gserviceaccount.com`
   - Permission: **Restricted** (read-only)
3. Note the property id exactly as GSC shows it in the property picker:
   - Domain property → `sc-domain:mpillow.com`
   - URL-prefix property → `https://custom.mpillow.com/` (trailing slash included)
4. Vercel → Settings → Environment Variables → **Production** (and `.env.local` for the backfill):
   ```
   GOOGLE_SEARCH_CONSOLE_SITE_URL=sc-domain:mpillow.com
   GOOGLE_SERVICE_ACCOUNT_EMAIL=mp-search-metrics@<project>.iam.gserviceaccount.com
   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
   ```
   Paste `private_key` from the JSON as-is; the literal `\n` escapes are converted in code.
5. Apply the migration: `pnpm db:push` (adds `seo_daily_metrics`)
6. Load history: `npm run seo:gsc-backfill` (16 months, one month per request batch, safe to re-run)
7. Redeploy. The daily `results-sla` cron now includes `gscIngest` in its JSON response. Check it once:
   `curl -H "Authorization: Bearer $CRON_SECRET" https://custom.mpillow.com/api/cron/results-sla`

   Expect `gscIngest.rows.total > 0`. A `403` in `gscIngest.error` means step 2 is missing or the site URL does not match the property id exactly.

Later, for slice 08: add the same service-account email in GA4 → Admin → Property access management → **Viewer**.

---

## B. GA4 MCP server in Claude Code on your laptop (~15 min)

Google's official server: https://github.com/googleanalytics/google-analytics-mcp. It is a local process, so it works with Claude Code on your machine, not with claude.ai cloud sessions.

**Prerequisites:** Python 3.10+, `pipx` (`brew install pipx && pipx ensurepath`), and the Google Cloud CLI (`brew install --cask google-cloud-sdk`).

1. **OAuth client for gcloud.** Cloud console (same project) → APIs & Services:
   - **OAuth consent screen**: User type *Internal* if on Google Workspace, otherwise *External* in Testing mode with your email added as a test user
   - **Credentials → Create credentials → OAuth client ID → Desktop app** → download the JSON, e.g. to `~/.config/mpillow/gcloud-client.json`

   This is needed because gcloud's built-in client cannot request the Analytics scope.
2. **Log in with read-only Analytics scope:**
   ```bash
   gcloud auth application-default login \
     --scopes https://www.googleapis.com/auth/analytics.readonly,https://www.googleapis.com/auth/cloud-platform \
     --client-id-file=$HOME/.config/mpillow/gcloud-client.json
   ```
   It prints the credentials path, usually `~/.config/gcloud/application_default_credentials.json`.
3. **Register with Claude Code at user scope.** Keep it out of the repo's `.mcp.json`: the credentials path is per-person, and cloud sessions cannot run it.
   ```bash
   claude mcp add analytics-mcp --scope user \
     -e GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud/application_default_credentials.json \
     -e GOOGLE_PROJECT_ID=<your-project-id> \
     -- pipx run analytics-mcp
   ```
4. **Verify:** start `claude`, run `/mcp` → `analytics-mcp` shows *connected*. Then ask:
   *"List my GA4 account summaries"*. The new `custom.mpillow.com` property should appear once `GA4-SETUP.md` is done.

Tools it provides: `get_account_summaries`, `get_property_details`, `list_google_ads_links`, `run_report`, `run_funnel_report`, `run_realtime_report`, `get_custom_dimensions_and_metrics`.

Useful first prompts:
- "Sessions by session default channel group for the last 28 days vs the previous 28"
- "Realtime active users by page on custom.mpillow.com"
- "Funnel: page_view on /mp-config → generate_lead → purchase, last 90 days" (after the slice 08 key events ship)

### Search Console from chat

There is no official Google MCP for Search Console. Instead of a community server holding your Google credentials, use the data from part A: it lands in Supabase `seo_daily_metrics`, which Claude can query through the Supabase connector (e.g. *"top 20 queries by clicks last 28 days from seo_daily_metrics, position = sum(position_sum)/sum(impressions)"*).

### Revoking

- B: `gcloud auth application-default revoke` and `claude mcp remove analytics-mcp --scope user`
- A: delete the key in Cloud console → Service accounts → Keys, and remove the user in GSC
