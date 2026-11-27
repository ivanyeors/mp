# 10 — Keep sending: a campaign that reaches people as they join its Audience

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-10-31; `20261031155043_campaign_keep_sending.sql`, applied to production 2026-10-31)
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

## As built (2026-10-31)

- **The columns** (`20261031155043_campaign_keep_sending.sql`): `keep_sending` (off by default,
  and only on a started campaign: a check), `keep_sending_daily_cap` (1 to 100, default 20),
  `keep_sending_paused_at`, and two the issue did not name:
  - `keep_sending_paused_reason`: why the daily run paused it; null when a person did.
  - `keep_sending_segments`: the filters of the Segment it sends to and of each it leaves out,
    as they were when a person turned it on or resumed it. **Added to the issue:** a started
    campaign's Segment id is fixed, but the Segment's filters can still be edited on the
    Customers page, which would widen the Audience with nobody approving it (PRD decision 6).
    The daily run compares them (`segmentChange`, any change, a left-out Segment's too, or one
    archived or gone) and pauses the campaign, saying why. Resume approves the Segments as they
    are now.
  `email_campaigns_guard()` already lists the columns it freezes, so these stay writable on a
  started campaign; its email and Audience do not. Asserted in
  `supabase/tests/campaign-audiences/assert-10-keep-sending.sql`.
- **The daily run** (`lib/email-campaigns/keep-sending-run.ts`, wired in
  `keep-sending-server.ts`), chained onto `/api/cron/results-sla` after the aftercare messages:
  for each campaign kept sending and not paused, oldest started first, one Wave labelled
  `daily-YYYY-MM-DD` (Singapore's date; the cron runs at 10:00 there) through the same
  `planWave`, `claim_marketing_campaign_send()` and `sendCampaignBatch` as a Staff Wave, the
  Segments read by the same `segment-sources.ts` the Staff Wave now uses. Its size is the cap less
  what today's Wave already claimed (a re-run never passes it), and never into the reserve
  (`KEEP_SENDING_RESERVE`, 30); the room is read again before each batch, in case a Staff Wave is
  sending too.
  - **It stops for the day** at the room down to the reserve, the pause rule, a 429 (or the send
    limit), or sending not set up. Every campaign left is listed as held with the reason.
  - **It pauses a campaign** whose Segments changed, or whose email fails a check (a link that
    died, a product taken off the shop, points turned off): those need a person. The day goes on
    for the others.
  - **It waits** two days after a campaign's first wave (`keptRampUntil`), so the first wave's
    bounces are in before more go. **Changed 2026-11-27:** it counts Singapore days, not 48 hours
    to the second, so the 10:00 run on the second day always sends. Measured in hours, a first
    wave sent after 10:00 missed that run by the difference and waited a third day. A person
    sending by hand is still told to wait the 48 hours (`rampUntil`).
  - It sends to anyone in the Audience who has not had it, so people the first wave left waiting
    for room get it too, a cap a day.
- **Visible:** the campaign list marks *Keeps sending* and *Paused*; the Sending card says how
  many campaigns keep sending and how many went today (`readKeptToday`); the Waves table names a
  daily Wave *Daily, 1 Nov* and manual waves keep counting `w1`, `w2` (`nextWaveLabel` skips
  daily labels). A started campaign's Send tab has a **Keep sending** card: the cap, *Keep
  sending*, then *Pause* / *Resume* and *Turn off*, and why the daily run paused it.
- **Audit:** each campaign's run is `email_campaign.kept_sending` with no actor, which the audit
  log now shows as *System*, with its counts, cap and reason. A person's changes are
  `email_campaign.keep_sending_on`, `_off`, `_cap`, `_pause`, `_resume`.
- **Telegram:** one line a day when a campaign keeps sending, counts only: *Kept sending: 3
  emails today from 1 campaign.*, with failures, pauses and why the day stopped early.

## Acceptance criteria

- [x] With the switch off, nothing sends without a person: the daily list reads
  `keep_sending = true`, not paused, live (`keep-sending-run.test.ts`), and the run skips any
  other campaign it is handed.
- [x] A run never exceeds the daily cap or the room left after the reserve, counting a re-run's
  claims (`keep-sending-run.test.ts`, `keep-sending.test.ts`).
- [x] The rest period, consent and suppression apply exactly as in a Staff Wave (same SQL): the
  run claims through `claim_marketing_campaign_send()`; the test leaves out an unsubscribed, a
  bounced and a resting person.
- [x] The cron count test (`lib/shopify/order-mirror-catchup.check.ts`) still passes: two crons.
