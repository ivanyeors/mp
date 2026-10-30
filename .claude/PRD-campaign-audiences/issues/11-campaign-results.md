# 11 — Results per campaign: clicks, unsubscribes, purchases after

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 08
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner sees which emails brought people back and which audiences were wrong. The demo: a
campaign reads *Sent 240 · Clicked 31 (13%) · Unsubscribed 2 · Spam 0 · Bought within 30 days 9,
S$2,140*, with the same by stage.

## What to build

- `email_campaign_stats` gains: unique clicks, unsubscribes (consent events with this campaign's
  send), and **purchases within 30 days**: Customers sent it with a **Purchase** paid within 30
  days after their `sent_at`, and its total. *After a click* is shown beside it.
- **By stage**: the same numbers split by the Lifecycle stage each person had when sent (stored on
  the send row at claim, `stage_at_send`, since the stage moves).
- **Rates** over sent, never over opens. Words say purchases after an email are not all caused by
  it.
- **The scorecard** (retention slice 06) reads M22 from here.
- **Holdout, optional** (owner decision 5): for a kept-sending campaign, a stable 10% by a hash of
  the Customer id is recorded as `held_out` on the ledger (never sent, never counted against
  Resend's room) and compared on the same 30-day purchase rate, with the sample size shown.

## Acceptance criteria

- [ ] A purchase is the CRM's **Purchase** (goods line, counted statuses), never a re-adjustment
  fee.
- [ ] Rates show a dash when nothing was sent, never 0%.
- [ ] The holdout never receives that campaign, including by a later manual Wave.
