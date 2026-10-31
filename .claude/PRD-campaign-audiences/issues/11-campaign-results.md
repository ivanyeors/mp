# 11 — Results per campaign: clicks, unsubscribes, purchases after

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-10-31; `20261031162653_campaign_results.sql`)
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

- [x] A purchase is the CRM's **Purchase** (goods line, counted statuses), never a re-adjustment
  fee.
- [x] Rates show a dash when nothing was sent, never 0%.
- [x] The holdout never receives that campaign, including by a later manual Wave.

## As built (2026-10-31)

- **The stage at send** (`20261031162653_campaign_results.sql`): `customer_campaign_sends`
  gains `stage_at_send`, filled by `claim_marketing_campaign_send()` from
  `admin_customer_overview.lifecycle_stage` (the CRM's own rule, read for one Customer: the id
  reaches every join), also on a retried failure. Sends from before it read as *Not recorded*.
- **What followed each send** is one view, `email_campaign_send_outcomes`: clicked, spam,
  unsubscribed from its link (as slice 08 counts them), and the **Purchases** paid in the 30
  days after `sent_at` (a counted Order with a goods line, as the overview's `pu` reads them),
  their total net of `amount_refunded`, whether one came after the first click, and whether the
  30 days are still open (`counting`).
- **`email_campaign_stats`** gains `bought`, `bought_after_click`, `bought_total`, `counting`
  and `held_out`; `waves` no longer counts a Wave that only held people out. **By stage** is
  `email_campaign_stage_results`, by `cohort` (`sent`, `held_out`, `sent_since_holdout`) and
  `stage`. The retention scorecard's M22 reads its `sent` rows (retention slice 06, not built:
  M22 also needs the same stage *not* sent it, which is the scorecard's to count).
- **The Results tab** on a started campaign (`results-panel.tsx`): Sent, Clicked, Unsubscribed,
  Marked as spam, Bought within 30 days with its S$ total and *after a click*, then the stages
  in funnel order, as a table on a wide screen and a list on a phone. Rates are over people
  sent, one decimal under 10%, a dash with nobody sent (`formatRate`). Its words say a purchase
  after an email is not proof the email caused it, that clicks are approximate, and how many
  sends are still inside their 30 days. The campaign list gains *Bought in 30 days*.
- **The holdout** (owner decision 5: off until 500 sent). A switch on the Keep sending card,
  *Hold out 10%*, offered once the campaign keeps sending and has been sent to 500 people
  (`holdoutBlocker`); `email_campaigns.holdout_at`, which a check allows only while it keeps
  sending (turning keep sending off clears it). Audited as `email_campaign.holdout_on` / `_off`.
  - **The claim decides**, so a later manual Wave or a retry cannot reach them: while the
    holdout is on, a Customer whose `campaign_holdout_bucket(id)` (the md5 of the id, mod 100)
    is under 10 gets a `held_out` ledger row instead of a send. The rule reads `held_out` before
    `already_sent` (`marketing_campaign_blocker`, `composedCampaignBlocker`, four new
    campaign-rule-cases), for good, even after the holdout is turned off.
  - A held-out row is no email: no provider id or click token (a check), not in Resend's room,
    not in the daily cap (`countWaveClaims`), not in the rest period (`marketing_recent` counts
    sent statuses only), not in *sent*. A Wave that only held people out is not listed.
  - **By the Customer id alone**, as the issue says: the same 10% for every campaign holding
    out, a holdout across Playbooks rather than a new 10% each time. Recorded in
    `CONTEXT.md` **Holdout**.
  - The plan says how many of the wave the holdout keeps back (`plan.heldOut`, from the
    candidates view's `holdout_bucket`).
  - **Compared fairly:** the held out beside the people sent since the first was held out (the
    same weeks), on the 30-day purchase rate, with both group sizes and a two-proportion test:
    a difference is called clear only at 95%, otherwise *Too close to call*.
- **Asserted** in `supabase/tests/campaign-audiences/assert-11-campaign-results.sql` (a
  partially refunded Purchase counted net, a re-adjustment fee, a cancelled Order and one past
  30 days not counted, the stage kept, the holdout recorded and never sent, by a later Wave or
  a retry, and its shape), and in `lib/email-campaigns/__tests__/results.test.ts`,
  `keep-sending-run.test.ts` (the daily run with a holdout) and `results-panel.test.tsx`.
