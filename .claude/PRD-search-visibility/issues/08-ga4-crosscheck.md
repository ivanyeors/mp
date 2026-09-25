# Slice 08 — GA4 property confirmation + Data API cross-check

Type: OPS + AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 21

## What to build

- OPS: confirm whether `GTM-TPB9LV2` sends to a GA4 property that includes `custom.mpillow.com`; if not, create one and publish the tag in GTM
- OPS: add a custom channel group "AI assistant" (placed above Referral) that includes Perplexity, which the built-in channel misses
- AFK: optional `lib/google/ga4-data.ts` `runReport` ingest of sessions/conversions by channel → `seo_daily_metrics` (`source` = `ga4`)
- Show GA4 vs first-party AI-assistant sessions side by side as a sanity check

## Acceptance criteria

- [ ] GA4 realtime shows `custom.mpillow.com` pageviews
- [ ] GA4 and first-party session counts are within an explained tolerance

## Blocked by

None
