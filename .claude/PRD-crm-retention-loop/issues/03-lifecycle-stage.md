# 03 — A lifecycle stage on every Customer, derived from their Orders

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** owner decision 1 (thresholds); slice 09 for Shopify-era dates, which it does not wait for
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:db`

## Goal

Every Customer has one word for where they are in the loop, and the list filters by it. The
demo: filter *Stage: At risk*, save it as a Segment, and it is a campaign Audience.

## Stages

As defined in [`../lifecycle-and-metrics.md`](../lifecycle-and-metrics.md#stages). A
**purchase** is a paid Order with at least one goods line, not pending, cancelled, refunded or
failed. A re-adjustment fee Order is not one. Each Customer is in exactly one stage, checked in
order:

| Stage | Rule (recommended thresholds, decision 1) |
|---|---|
| *Lapsed* | last purchase over 24 months ago |
| *At risk* | last purchase 12 to 24 months ago |
| *Loyal* | 3 or more purchases |
| *Repeat* | 2 purchases |
| *New* | 1 purchase, with a delivery state: awaiting delivery, delivered, settled |
| *Lead* | a Customer with no purchase yet |

**Shopify customers are in the same stages** (owner, 2026-10-27). Until slice 09 imports their
order dates, a Migrated customer with Shopify-era orders and no purchase here is placed by their
imported count (New, Repeat or Loyal) and marked *no dates yet*; they cannot be At risk or Lapsed
until their dates exist. After slice 09, their imported purchases count like any other.

## What to build

- A migration appending `purchases`, `last_purchase_at` and `lifecycle_stage` to the overview
  with `create or replace view`, at the end (`lib/crm/customer-overview.ts` explains why), and to
  `CUSTOMER_OVERVIEW_COLUMNS`. `purchases` counts Orders with a goods line
  (`order_items.kind = 'goods'`), so a re-adjustment fee is never a purchase. The existing
  *Last order* filter moves onto `last_purchase_at` in the same change.
- The thresholds as constants in one module, `lib/crm/lifecycle-stage.ts`, with a pure
  `lifecycleStage(row, now)` that the view's SQL mirrors, and a test that holds the two equal
  over a table of cases, as `purchase-lines.check.ts` does for `bought`.
- A `stage=` filter (comma list) in `customerFiltersSchema`, so Segments and links carry it.
- A *Stage* column on the Customers list and the stage on the Customer detail's Profile card.
- `CONTEXT.md`: **Lifecycle stage**, with each stage's rule.

## Acceptance criteria

- [ ] The stage reads orders only: never reviews, ratings, returns or notes (PRD decision 4).
- [ ] A refund that leaves no purchase moves the Customer back to *Lead*.
- [ ] A paid re-adjustment never moves a Customer to *Repeat*.
- [ ] A Segment saved before this slice still parses, unchanged.
- [ ] The overview test fails if the view and `CUSTOMER_OVERVIEW_COLUMNS` disagree.
