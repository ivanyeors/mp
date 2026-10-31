# 07 — A rest period between one person's emails

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-10-31)
**Blocked by:** 01 (owner decision 2)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:email`

## Goal

Running several campaigns at once never floods one person. The demo: a Wave of 80 for *We miss
you* sends to 62; the plan says *Resting: 18, emailed in the last 7 days, next eligible from 4
Nov*.

## What to build

- **The rule**, in both places that must agree:
  - `marketing_campaign_blocker()`: a new blocker `resting` when the Customer has a marketing
    email `sent` within the last N days, or M or more within 30 days. Marketing email is
    `customer_campaign_sends` (`sent`, `bounced`, `complained`) and the `customer_emails` rows
    for `points.expiry_%`. Transactional and aftercare rows never count.
  - `composedCampaignBlocker` in `lib/email-campaigns/rules.ts`, with the same constants.
  - New cases in `supabase/tests/email-marketing/campaign-rule-cases.json`, held equal by the
    existing test.
- **Skipped, not failed.** `claim_marketing_campaign_send()` writes no row for a resting Customer,
  so a later Wave reaches them. The plan shows the count and the earliest next date.
- **Constants** in code (`REST_DAYS = 7`, `REST_MAX_PER_30_DAYS = 4`, owner decision 2), shown
  in words on the Sending card.
- The points-expiry reminders keep sending on their own schedule (they are due by date), but
  count toward everyone else's rest.

## As built (2026-10-31)

- **Migration** `20261031144935_campaign_rest_period.sql`:
  - `marketing_recent(customer)`: their marketing email of the last 30 days, newest first. Any
    campaign ledger row but a failed one (`pending` counts, so two campaigns' Waves at once cannot
    both reach someone), and `points.expiry_%` reminders that were sent. Order, aftercare and
    every other `customer_emails` row never count.
  - `marketing_rest_until(customer)`: the later of the latest + 7 days and, with 4 or more in 30
    days, the 4th most recent + 30 days; null when not resting.
  - `marketing_campaign_blocker()` gains `resting`, **last**, so a plan still says *already sent*
    or *unsubscribed* first.
  - `claim_marketing_campaign_send()` locks the Customer's row before the rule, so two campaigns
    claiming one person at once are decided one after the other; the second sees the first's
    `pending` row and rests them. A resting Customer gets no ledger row.
  - `marketing_campaign_candidates` gains `marketing_recent`.
- **TypeScript:** `REST_DAYS`, `REST_MAX_PER_30_DAYS`, `REST_WINDOW_DAYS`, `REST_PERIOD_TEXT`,
  `restUntil()` in `lib/email-campaigns/rules.ts`; `composedCampaignBlocker` and
  `planCampaignWave` take `now`; the plan carries `restingUntil`, the earliest any resting person
  is next eligible.
- **The plan** says *N left out: resting (emailed in the last 7 days, or 4 times in 30 days); the
  first can get it from 4 Nov 2026*. **The Sending card** states the rule in words.
- **The sender** counts a resting claim under `skipped`, never `failed`; it takes none of
  Resend's room.
- **Tests:** 16 new cases in `campaign-rule-cases.json` (TypeScript and SQL);
  `supabase/tests/campaign-audiences/assert-07-rest-period.sql` (what counts, the date, no
  ledger row, the view, grants, and a two-session race that fails without the lock);
  `restUntil` and plan tests in `rules.test.ts`; sender tests for skip-not-fail and the test send.
- `assert-01-email-campaigns.sql` now rests Ann before her second campaign: the same day is
  `resting`, 8 days later is a send.

## Acceptance criteria

- [x] The TypeScript rule and the SQL function give every case the same answer.
- [x] A resting Customer is never marked failed and never consumes Resend's room.
- [x] A test send ignores the rest period (it goes to Staff addresses, not Customers).
