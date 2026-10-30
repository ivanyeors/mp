# 12 — Engaged and unengaged: stop emailing people who never click

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 08, and three months of clicks; owner decision 4
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:email`

## Goal

The list stays healthy: people who never engage stop receiving campaigns before they mark one as
spam. The demo: a subscriber with no click in their last six campaigns and nothing bought for a
year gets one "Still want to hear from us?" email; with no click in 30 days, they are
*Unengaged* and left out.

## What to build

- **Unengaged**, derived on the overview (never stored): subscribed; sent at least N campaigns;
  no Campaign click on the last N; no Purchase, attended booking or Sign in for 12 months; and
  the re-permission email sent over 30 days ago with no click.
- **The claim rule** refuses `unengaged` (TS, SQL and cases, as slice 07), unless the campaign
  says *Include unengaged* (off by default; the re-permission campaign has it on).
- **The re-permission email**: a Starter with finished words, kept sending (slice 10) to the
  *About to be unengaged* Segment. One click on *Keep me subscribed* is a Campaign click and so
  re-engages them.
- An *Engagement* filter (`engaged=yes`, `no`, `unengaged`) on the Customers list.
- Consent is unchanged: Unengaged is a sending choice. The Profile and support see *subscribed*.

## Acceptance criteria

- [ ] No one becomes Unengaged before they were sent the re-permission email.
- [ ] Unengaged is never a Lifecycle stage and never moves one.
