# 08 — Clicks and unsubscribes, tied to the campaign that caused them

**Issue:** not filed
**Type:** AFK, then HITL (privacy policy line)
**Status:** **built** (2026-10-31). Open: the privacy policy line (HITL)
**Blocked by:** 01
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:email`

## Goal

Each campaign shows who clicked and who left because of it. The demo: a test customer clicks
the button in a campaign; their send shows *Clicked 30 Oct*; they unsubscribe from the same email
and the campaign's page shows *1 unsubscribed*.

## What to build

- **A click token per send.** The sender adds `mc=<token>` to every site link (not the
  unsubscribe link, not third-party links). The token is opaque; only its hash is stored, on the
  `customer_campaign_sends` row, as the Claim link's is (`mintClaimLink`).
- **Recording.** The site's request proxy (`proxy.ts`) reads `mc` on a page GET, records
  `first_clicked_at` and `clicks` on that send through a service-role RPC, and redirects to the
  same URL without it, so the token never reaches analytics, a shared link or a screenshot.
  HEAD requests and requests within 10 seconds of the send's `sent_at` are not counted (link
  scanners).
- **Never an identity.** The click does not merge a Visitor into the Customer and does not sign
  anyone in (PRD decision 4).
- **Unsubscribe attribution.** The unsubscribe link and the `List-Unsubscribe` URL carry the send
  (signed, as `u` and `t` are). `set_marketing_email()` takes an optional `campaign_send_id`,
  stored on `customer_consent_events` (new nullable column). The one-click POST records it too.
- **The Customer timeline** shows *Clicked "<campaign>"* and *Unsubscribed from "<campaign>"*.
- **UTMs stay** for GA4, by campaign name, unchanged.
- **Privacy policy:** a line that marketing emails record which links are clicked (HITL).

## As built (2026-10-31)

- **Migration** `20261031140000_campaign_clicks_and_unsubscribes.sql`:
  - `customer_campaign_sends` gains `click_token_hash` (SHA-256 hex, unique, shape-checked),
    `first_clicked_at` and `clicks` (checked to go together).
  - `finish_campaign_send()` takes the hash as a fifth argument and keeps it with a successful
    send only. `record_campaign_click(hash, at)` counts a click on a send that went out, and not
    within 10 seconds of `sent_at`.
  - `customer_consent_events.campaign_send_id`; `set_marketing_email()` takes it as a fifth
    argument and keeps it only when the send is that Customer's own. Both functions are dropped and
    made again, so there is one of each: a future restatement must keep all five arguments, or a
    four-argument copy becomes an ambiguous overload.
  - A spam complaint names its send too (`record_campaign_send_event`).
  - `email_campaign_stats` gains `clicked`, `clicks` and `unsubscribed` (from the campaign's own
    unsubscribe link; a complaint stays the spam count).
- **`lib/email-campaigns/click.ts`**: a random 32-byte token per send, its hash, `addClickToken`
  (every site `href` and every site address in the text, never the unsubscribe page or route,
  never another site), `stripClickToken`, `recordCampaignClick` (never throws, never logs the
  token). Web Crypto only, so the proxy needs no `node:crypto`.
- **The sender** mints a token per email, adds it to the site links and stores its hash on finish.
  A test send carries none.
- **`proxy.ts`** takes `mc` off a page request with a 302 (`no-store`, `no-referrer`) before
  anything renders, and records a GET after the response (`waitUntil`). A HEAD or a known crawler
  is redirected and not counted. The click identifies nobody and signs nobody in.
- **The unsubscribe link** carries the send, `s`, signed with the Customer:
  `HMAC(customer:send)`. A link sent before verifies as before and names no campaign, an `s`
  added to one by hand included; a link whose `s` was changed no longer verifies. The page
  passes `s` on with its button.
- **The campaign** shows *clicked* and *unsubscribed* on its Send card, and as columns in the
  list. **The Customer timeline** shows *Clicked "<campaign>"* (with the count) and *Unsubscribed
  … by the unsubscribe link in "<campaign>"* or *by a spam complaint about "<campaign>"*.
- **Tests:** `click.test.ts`, `click-proxy.test.ts`, sender, unsubscribe and route tests, the
  timeline's `campaign-clicks.test.ts`, and
  `supabase/tests/campaign-audiences/assert-08-clicks-unsubscribes.sql`.

## Acceptance criteria

- [x] No click token is stored in plain text or logged.
- [x] The token is stripped by redirect before the page renders.
- [x] An unsubscribe without a send (Profile, support) still works and records no campaign.
- [x] No open pixel is added.
- [ ] The privacy policy says marketing emails record which links are clicked (HITL).
