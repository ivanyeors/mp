# 07 — A rest period between one person's emails

**Issue:** not filed
**Type:** AFK
**Status:** not started
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

## Acceptance criteria

- [ ] The TypeScript rule and the SQL function give every case the same answer.
- [ ] A resting Customer is never marked failed and never consumes Resend's room.
- [ ] A test send ignores the rest period (it goes to Staff addresses, not Customers).
