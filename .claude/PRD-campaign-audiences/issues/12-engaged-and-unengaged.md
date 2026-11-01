# 12 — Engaged and unengaged: a simple rule, read from the Lifecycle stage

**Issue:** not filed
**Type:** AFK
**Status:** **built** (2026-11-01)
**Blocked by:** 08 (clicks); owner decision 4 settled 2026-10-31
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:email`

## Goal

The list stays healthy without anyone tuning it: people who stopped buying and never click stop
receiving campaigns before they mark one as spam. The demo: on the Customers list, *Engagement:
Unengaged* shows a Lapsed customer who clicked none of their last six campaigns; a new campaign to
*Everyone subscribed* leaves them out; a win-back campaign that ticks *Include unengaged* reaches
them.

## The rule (owner decision 4)

"Can we create a simple rule based filter? with our customer's lifecycle stage in mind."

| Lifecycle stage | Unengaged? |
|---|---|
| *New*, *Loyal* | Never: they bought or visited in the last 12 months |
| *At risk* (12–24 months since the last Purchase or attended booking) | Never |
| *At risk · Lapsed* (over 24 months) | When they clicked none of their last 6 campaigns |
| *Lead* (never bought), a Customer for over 12 months | When they clicked none of their last 6 campaigns |
| *Lost* | Already out: *Lost* means unsubscribed |

Someone sent fewer than 6 campaigns is never Unengaged. The stage thresholds are the stage's own
(`lib/crm/lifecycle-stage.ts`); the 6 and the 12 months are code constants beside them, not
settings.

## What to build

- **Unengaged**, derived on the overview (`admin_customer_overview`), never stored: the table
  above, with clicks from slice 08's `customer_campaign_sends`.
- **An *Engagement* filter** on the Customers list (`engaged=yes`, `unengaged`), through
  `applyCustomerFilters`, so it can be listed, saved as a Segment and emailed like any filter.
- **Campaigns leave it out by default.** The claim rule refuses `unengaged` (TS, SQL and
  `campaign-rule-cases.json`, as slice 07), unless the campaign ticks *Include unengaged* (off by
  default; a win-back to *At risk · Lapsed* turns it on). The send checklist says how many it
  left out.
- **Optional, later:** a "Still want to hear from us?" Starter for the people about to become
  Unengaged; a click re-engages them.
- Consent is unchanged: Unengaged is a sending choice. The Profile and support see *subscribed*.

## As built (2026-11-01)

- **Migration** `20261101081436_campaign_unengaged.sql`:
  - `customer_unengaged(stage, detail, since, sent, clicked, now)`: the rule, once. *Since* is
    `customers.created_at`: an imported Customer's is the import, as the Shopify export carries
    no sign-up date, so an imported Lead cannot be Unengaged before 12 months after the import.
  - `admin_customer_overview` appends `unengaged`: their latest 6 campaign emails the provider
    accepted (sent, or since bounced or complained; never a held-out row or a migration-wave
    send), how many they clicked, and the stage and sub-status the overview already computes.
  - `email_campaigns.include_unengaged`, off by default; `email_campaigns_guard()` freezes it
    with the Audience at the first Wave.
  - `marketing_campaign_blocker()` gains `unengaged` after `already_sent` and before `resting`,
    reading the overview's column for that one Customer, unless the campaign includes them. The
    claim runs the blocker, so an Unengaged Customer gets no ledger row: skipped, never failed.
- **TypeScript:** `lib/crm/engagement.ts` (`isUnengaged`, the twin; `UNENGAGED_AFTER_CAMPAIGNS`,
  `LEAD_UNENGAGED_AFTER_MONTHS`); `composedCampaignBlocker` and `planCampaignWave` take
  `includeUnengaged`; `readCampaignCandidates` marks each candidate from one read of the
  overview's Unengaged, so the plan, the list and the claim read the same column. A plan that
  cannot read it refuses the wave.
- **Customers:** the *Engagement* filter (`engagement=engaged|unengaged`) under Reach → Campaign
  history; the Stage cell and the Customer's header add *Unengaged* to the line under the stage,
  with the rule on hover. Consent is unchanged.
- **Campaigns:** *Include unengaged* under *Leave out people in…*, locked with the Audience; the
  plan's *N left out: unengaged (…)*; the confirmation's audience words say *the Unengaged
  included*.
- **Tests:** 16 new cases in `campaign-rule-cases.json` (TypeScript through the twins, SQL
  through real rows); `assert-12-unengaged.sql` (grants, the list filter, no ledger row, the
  win-back, the lock, a click and a purchase ending it); `engagement-sql.test.ts`;
  `sender-unengaged.test.ts`; the Engagement filter in `customer-filters.test.ts`.
- **Not built:** the optional "Still want to hear from us?" Starter.

## Acceptance criteria

- [x] Unengaged is never a Lifecycle stage and never moves one.
- [x] A customer who bought in the last 24 months is never Unengaged.
- [x] The filter and the claim rule agree: one SQL function, cases in `campaign-rule-cases.json`.
