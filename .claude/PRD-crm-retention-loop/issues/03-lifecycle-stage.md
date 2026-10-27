# 03 — A lifecycle stage on every Customer, derived from their Orders

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** owner decisions 1 and 2
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:db`

## Goal

Every Customer has one word for where they are in the loop, and the list filters by it. The
demo: filter *Stage: At risk*, save it as a Segment, and it is a campaign Audience.

## Stages

Derived in `admin_customer_overview` from `paid_orders` and `last_paid_at` (which already count
only paid Orders that are not pending, cancelled, refunded or failed) and, for decision 2, the
**Migrated customer**'s imported order count. Each Customer is in exactly one, checked in order:

| Stage | Rule (recommended thresholds, decision 1) |
|---|---|
| *Lapsed* | last paid Order over 24 months ago |
| *At risk* | last paid Order 12 to 24 months ago |
| *Loyal* | 3 or more paid Orders |
| *Repeat* | 2 paid Orders |
| *New* | 1 paid Order |
| *Earlier buyer* | no paid Order here, Shopify-era orders imported (decision 2) |
| *Prospect* | no paid Order at all |

## What to build

- A migration appending `lifecycle_stage` to the overview with `create or replace view`, at the
  end (`lib/crm/customer-overview.ts` explains why), and to `CUSTOMER_OVERVIEW_COLUMNS`.
- The thresholds as constants in one module, `lib/crm/lifecycle-stage.ts`, with a pure
  `lifecycleStage(row, now)` that the view's SQL mirrors, and a test that holds the two equal
  over a table of cases, as `purchase-lines.check.ts` does for `bought`.
- A `stage=` filter (comma list) in `customerFiltersSchema`, so Segments and links carry it.
- A *Stage* column on the Customers list and the stage on the Customer detail's Profile card.
- `CONTEXT.md`: **Lifecycle stage**, with each stage's rule.

## Acceptance criteria

- [ ] The stage reads orders only: never reviews, ratings, returns or notes (PRD decision 4).
- [ ] A refund that leaves no counted Order moves the Customer back to its earlier stage.
- [ ] A Segment saved before this slice still parses, unchanged.
- [ ] The overview test fails if the view and `CUSTOMER_OVERVIEW_COLUMNS` disagree.
