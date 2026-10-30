# 05 — Reach filters: ships to, language, points expiry, campaign history

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 08 for the *clicked* values (the rest does not wait)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Staff can choose people by where they are, what they read, and what we last sent them. The demo:
*At risk · Ships to Singapore · Not emailed in 30 days*.

## What to build

As slice 04, each a filter on the overview:

- **Ships to** (`ships_to=sg`, `not-sg`, `unknown`): the latest Order's shipping country, else the
  default address's. A new overview column `ship_country`. *Unknown* is its own value, never
  Singapore.
- **Language** (`language=zh-cn`, `en`): `customers.locale`.
- **Points expire within** (`points_expire=within:3`): months until `points_expires_on()`
  (`20261021170000_points_expiry.sql:76`), for a balance above 0. A new overview column
  `points_expire_on`.
- **Campaign** (`campaign=<id>:sent`, `:not-sent`, `:clicked`, `:not-clicked`): from
  `customer_campaign_sends`. The control lists campaigns by name.
- **Last emailed** (`emailed=within:14`, `over:30`, `never`): days since
  `last_campaign_sent_at`, already on the overview.

## Acceptance criteria

- [ ] A Segment on `campaign=<id>:not-clicked` is refused as an Audience for that same campaign
  (it would never send), with words saying why.
- [ ] *Ships to* counts *Unknown* in the list's summary.
