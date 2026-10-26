# 01 — Send within Resend's plan: the allowance, a wave cut to today's room, a 429 stops at once

**Issue:** not filed
**Type:** AFK
**Status:** built
**Blocked by:** —
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:email`

## Goal

The owner sends from Email campaigns on Resend's free plan (100 a day, 3,000 a month) and never
hits the limit mid-wave. The demo: 38 emails went out this morning. The owner asks for a wave of
200. The page plans 62 for now, says the other 138 go in later waves, and sends 62. Tomorrow the
next wave picks up where this one stopped.

## What to build

- **The allowance** (`lib/customer-migration/campaign-ledger.ts`, shared by the page and the
  script):
  - `readRecentCampaignSends` counts the ledger's used sends (pending, sent, bounced, complained)
    over the last 24 hours and 31 days, plus test sends from `admin_audit_log`
    (`email_campaign.test`, `after.sent`). It returns when the oldest counted send in each window
    leaves it.
  - `sendAllowance(limits, recent)` is pure. It returns the used and left for the day and the
    month, the binding limit, and `roomAt`: when room opens again if none is left.
- **Readiness** (`lib/email-campaigns/sender.ts`): `campaignReadiness` adds a `send_limit` check
  and returns the allowance. The limits come from `campaignSendLimits()` in the setup.
- **Planning:** `planWave` cuts the selection to the room left and reports `requested`,
  `limitedBy` and `waiting` (eligible people not in this wave).
- **Sending:** `sendCampaignBatch` re-reads the room before each batch. It cuts the batch to what
  is left and stops when nothing is. A Resend 429 quota answer (`isSendQuotaError`) stops the wave
  at once, with a plain reason.
- **Tests:** `sendCampaignTest` is refused when today's room is smaller than its addresses, and
  says when room opens again.
- **The script** counts tests in the same allowance.

## Acceptance criteria

- [x] The ledger and tests are counted over both windows; the smaller room wins.
- [x] `roomAt` is the oldest counted send in the binding window, plus that window.
- [x] `CAMPAIGN_DAILY_SEND_LIMIT` / `CAMPAIGN_MONTHLY_SEND_LIMIT` change the limits.
- [x] A wave is never planned past today's room; at zero the `send_limit` check fails and nothing
  starts.
- [x] A batch stops when the room runs out mid-wave (another sender used it), without claiming
  anyone past it.
- [x] A 429 quota answer stops the wave after that one send, which is marked failed (retryable).
- [x] A test is refused without room.
- [x] The tip no longer suggests "500 a day".

## Verify

```bash
npx vitest run lib/email-campaigns lib/customer-migration
```
