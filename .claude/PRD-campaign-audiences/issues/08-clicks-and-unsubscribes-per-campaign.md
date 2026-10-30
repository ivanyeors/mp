# 08 — Clicks and unsubscribes, tied to the campaign that caused them

**Issue:** not filed
**Type:** AFK, then HITL (privacy policy line)
**Status:** not started
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

## Acceptance criteria

- [ ] No click token is stored in plain text or logged.
- [ ] The token is stripped by redirect before the page renders.
- [ ] An unsubscribe without a send (Profile, support) still works and records no campaign.
- [ ] No open pixel is added.
