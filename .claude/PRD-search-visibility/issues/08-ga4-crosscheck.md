# Slice 08 — GA4 property confirmation + Data API cross-check

Type: OPS + AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 21

## What to build

- **Decision:** no existing GA4 property. OPS follows `../GA4-SETUP.md`: new property, direct gtag via `NEXT_PUBLIC_GA_MEASUREMENT_ID`, audit then retire GTM `GTM-TPB9LV2`, `Default + AI` channel group, internal-traffic filter, unwanted-referral list, Search Console link, 14-month retention
- AFK: `lib/analytics/ga-events.ts`, a typed `trackGaEvent()` wrapper over `window.gtag` (no-op when absent, e.g. in dev). Fire `generate_lead` (Result submitted), `book_appointment`, `begin_checkout`, `purchase` (once per `transaction_id`, from the Order total). No PII in params.
- AFK: make the journey tracker's `mp_page_view` / `mp_section_view` dataLayer pushes also work under direct gtag, or drop them if first-party ingest already covers them
- AFK: optional `lib/google/ga4-data.ts` `runReport` ingest of sessions/conversions by channel → `seo_daily_metrics` (`source` = `ga4`)
- Show GA4 vs first-party AI-assistant sessions side by side as a sanity check

## Acceptance criteria

- [ ] GA4 realtime shows `custom.mpillow.com` pageviews, one `collect` hit per page view (no GTM double-count)
- [ ] The 4 key events appear in DebugView with correct values; `purchase` fires once per order
- [ ] GA4 and first-party session counts are within an explained tolerance

## Blocked by

None
