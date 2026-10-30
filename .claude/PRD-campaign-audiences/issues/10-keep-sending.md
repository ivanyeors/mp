# 10 — Keep sending: a campaign that reaches people as they join its Audience

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 01 (owner decision 3), 07
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`

## Goal

A Playbook reaches each customer at their own moment, without anyone running a Wave each week.
The demo: *Second purchase*, Audience *Delivered over 60 days · Didn't buy Mbolster*, set to keep
sending; tomorrow at 10:00 the three customers who crossed 60 days get it, and the campaign's
page lists that Wave.

## What to build

- **The switch.** On a campaign whose first Wave has finished: *Keep sending to people who join
  this Audience*, with a daily cap (default 20) and a Pause switch. Off by default. Stored on
  `email_campaigns` (`keep_sending`, `keep_sending_daily_cap`, `keep_sending_paused_at`).
- **The daily run**, chained onto `/api/cron/results-sla` (no third cron): for each campaign kept
  sending and not paused, one Wave of up to its cap, through the same `planCampaignWave`,
  `claim_marketing_campaign_send()` and batch sender as a Staff Wave. It stops for the day at:
  - Resend's remaining room less a reserve (default 30) for tests and manual Waves;
  - the pause rule (bounces or spam reports over the line on the last Wave of any campaign);
  - a 429 from Resend.
- **Nothing new is sent.** The email and the Audience are the ones locked at the first Wave
  (PRD decision 6). A kept-sending campaign cannot be edited; to change it, duplicate it.
- **Visible.** The campaign list marks kept-sending campaigns; the Sending card shows today's
  kept-sending total; the audit log records each run as *system*, with counts.
- **Telegram** (optional): one daily line, counts only, no names.

## Acceptance criteria

- [ ] With the switch off, nothing sends without a person.
- [ ] A run never exceeds the daily cap or the room left after the reserve.
- [ ] The rest period, consent and suppression apply exactly as in a Staff Wave (same SQL).
- [ ] The cron count test (`lib/shopify/order-mirror-catchup.check.ts:24`) still passes.
