# 12 — Engaged and unengaged: a simple rule, read from the Lifecycle stage

**Issue:** not filed
**Type:** AFK
**Status:** not started
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

## Acceptance criteria

- [ ] Unengaged is never a Lifecycle stage and never moves one.
- [ ] A customer who bought in the last 24 months is never Unengaged.
- [ ] The filter and the claim rule agree: one SQL function, cases in `campaign-rule-cases.json`.
