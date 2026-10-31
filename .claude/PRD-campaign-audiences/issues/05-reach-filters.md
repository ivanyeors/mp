# 05 — Reach filters: ships to, language, points expiry, campaign history

**Issue:** not filed
**Type:** AFK
**Status:** built 2026-10-31 (`20261031150000_customer_overview_reach_filters.sql`; not yet applied to production)
**Blocked by:** 08 for the *clicked* values (built)
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

## As built

- **The overview** appends six columns: `ship_country`, `locale`, `points_expire_on`,
  `campaigns_sent`, `campaigns_clicked` and `last_emailed_at`.
- **Ships to.** The latest *counted* Order with a two-letter country (a self-collect or
  re-adjustment Order is the studio's, `SG`), else the default address, else the address saved
  last. A pending Order, or a country that is not two letters, counts for nothing. `not-sg` is
  `ship_country <> 'SG'`, which never lists a null, so *Unknown* is in neither Singapore nor
  outside it.
- **Unknown in the summary.** With *Ships to* Singapore or outside it, the list makes a second,
  head-only count with the same filters and `ships_to=unknown`, and says under the chips: *"12
  more match the other filters but ship to an unknown country"*.
- **Points expire within** mirrors `points_balance()`: `points_expires_on()` over
  `points_clock()`, for an available balance above 0. It is null while points are off, because
  nothing expires then. The cutoff is today in Singapore plus N months, clamped as Postgres
  clamps. Presets 1, 3 and 6 months; a link may carry 1–24.
- **Campaign** is one campaign and one state (`<id>:sent`, `not-sent`, `clicked`,
  `not-clicked`). *Got it* is a send the provider accepted (sent, bounced or complained), as the
  campaign's own *Sent* counts it. *Didn't click* is got it and never clicked. The control lists
  campaigns that have started sending, latest first, by name, archived ones included. The
  Customers page reads names only, with `customers`. A link's campaign that is not listed still
  shows.
- **Last emailed** reads `last_campaign_sent_at`. *Not emailed in N days* (`over:N`) keeps
  people never emailed: `last_emailed_at` is `-infinity` for them, so it is one `lt` with no `or`
  (ADR 0028 (d)). Without this, the PRD's demo would list nobody at launch, when no imported
  customer has been emailed from here. *Never* is its own value too.
- **The refusal.** `selfDefeatingAudience` (lib/email-campaigns/rules.ts) refuses a Segment whose
  *Campaign* filter is this same campaign with *got it*, *clicked it* or *got it, didn't click*.
  It is checked on Save (under *Send to*) and again at every wave plan, because the Segment can
  change after the campaign is saved. *Didn't get it* passes: that is who the campaign has left
  to reach.
- No `filters_version` bump: every key is new.

## Acceptance criteria

- [x] A Segment on `campaign=<id>:not-clicked` is refused as an Audience for that same campaign
  (it would never send), with words saying why. The same goes for `:sent` and `:clicked`
  (`app/[lang]/settings/campaigns/__tests__/audience-never-sends-actions.test.ts`).
- [x] *Ships to* counts *Unknown* in the list's summary.
- [x] Each filter has a mapping test (`lib/crm/__tests__/customer-filters.test.ts`) and a check
  against the overview on real Postgres (`lib/crm/reach-filters.check.ts`: 6 Customers, 18
  filter links), passing on a database with every migration applied. Breaking the address order
  in the view or the `lt` column in the mapping fails it.
- [x] `campaign-rule-cases.json` is untouched: filters choose, the claim rule decides.
