# 02 — The Sending card on Email campaigns: connected, From, Reply-To, reports, today and this month

**Issue:** not filed
**Type:** AFK
**Status:** built
**Blocked by:** 01
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner opens Email campaigns and sees at once that Resend works and how much is left. That
answers "can we add a Resend API key in our settings page" without the key ever reaching the
browser (PRD decision 1). The demo: the card reads *Resend connected · Sending from
hello@hello.mpillow.com · Replies go to support@… · Bounce and spam reports on*. Below it,
*Today: 38 of 100 sent, 62 left* and *This month: 140 of 3,000*.

## What to build

- `readSendingStatus()` (`lib/email-campaigns/sender.ts`): the checks with no network call, plus
  whether `CAMPAIGN_RESEND_WEBHOOK_SECRET` is set, plus the allowance. It never returns a key or
  any part of one.
- `SendingStatusCard` (`app/[lang]/settings/campaigns/sending-status-card.tsx`), rendered by the
  list page:
  - one row each for the connection, the From, the Reply-To and reports, each a tick or a cross
    with words, never colour alone;
  - a failing row names what to set in Vercel (Production);
  - two meters, today and this month; at zero, "Room again from …";
  - *Run every check* runs the full readiness, with the unsubscribe probes.

## Acceptance criteria

- [x] Every state reads correctly: connected or not, From missing or wrong, no Reply-To,
  reports off, room left, none left with a time.
- [x] Nothing on the page or in an action's answer carries a key.
- [x] Only `campaigns` holders see it (the page's existing gate).
- [x] It works on a phone: the rows stack and the meters span the width.

## Verify

```bash
npx vitest run "app/[lang]/settings/campaigns"
```
