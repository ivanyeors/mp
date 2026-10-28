# 03 — A lifecycle stage on every Customer, derived from their Orders

**Issue:** [#339](https://github.com/ivanyeors/mp/issues/339)
**Type:** AFK
**Status:** built on `claude/crm-loop-handoffs-dropoff`; migration `20261028033330_lifecycle_stage.sql` applied to production 2026-10-28
**Blocked by:** none. Owner decision 1 settled 2026-10-27: *At risk* from 12 months, *Lapsed* from
24. Slice 09 brings Shopify-era dates; this slice does not wait for it.
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:db`

## Goal

Every Customer has one word for where they are in the loop, and the list filters by it. The
demo: filter *Stage: At risk*, save it as a Segment, and it is a campaign Audience.

## Stages

As defined in [`../lifecycle-and-metrics.md`](../lifecycle-and-metrics.md#stages). A
**purchase** is a counted Order (paid, not pending, cancelled, refunded or payment-failed, as
`isCountedOrder` and the overview's `paid_orders` already count) with at least one goods line
(`order_items.kind = 'goods'`). A re-adjustment fee Order, all service lines, is not one. Each
Customer is in exactly one stage, checked in order:

| Stage | Rule (owner, 2026-10-27) |
|---|---|
| *Lapsed* | last purchase more than 24 calendar months ago |
| *At risk* | last purchase 12 to 24 calendar months ago |
| *Loyal* | 3 or more purchases |
| *Repeat* | 2 purchases |
| *New* | 1 purchase |
| *Lead* | no purchase yet |

Months are calendar months counted the way Postgres counts `now() - interval '12 months'` in
UTC, which `monthsBefore` already mirrors for the *Last order* filter. The cut-offs are strict,
as that filter's are: a purchase exactly 12 months ago is not yet *At risk*, and exactly 24 is
still *At risk*. So *At risk* and *Lapsed* together are exactly the dated buyers *Last order: over
a year ago* lists.

**New has a delivery step**, from that one purchase's `delivered_at`: *awaiting delivery* (not
delivered yet), *delivered* (under 30 days ago), *settled* (30 days or more, when the return window
closes, as Points release, ADR 0011). `delivered_at` is stamped by the courier webhook, an in-store
handover and Staff marking the Order delivered.

**Shopify customers are in the same stages** (owner, 2026-10-27). Until slice 09 imports their
order dates, a Migrated customer's Shopify-era order count (`migrated_customers.shopify_orders_count`)
is added to their purchases here. Recency is read from purchases here only, so a Customer whose
every purchase is Shopify-era is placed by count (*New*, *Repeat* or *Loyal*) and marked
*no dates yet* (`lifecycle_undated`); they cannot be *At risk* or *Lapsed* until their dates exist.
Slice 09 replaces the count with the imported Orders, and must stop adding it in the same change.

Production on 2026-10-27: 2,161 Customers, 1,617 with Shopify-era orders, no counted platform
Orders yet. So at launch every buyer is *no dates yet*, and *At risk* and *Lapsed* fill only once
slice 09 lands or platform Orders age.

## What to build

- A migration appending to `admin_customer_overview`, with `create or replace view` at the end
  (`lib/crm/customer-overview.ts` explains why), and to `CUSTOMER_OVERVIEW_COLUMNS`:
  `purchases`, `last_purchase_at`, `lifecycle_stage` (`lead`, `new`, `repeat`, `loyal`,
  `at_risk`, `lapsed`), `lifecycle_delivery` (`awaiting_delivery`, `delivered`, `settled`, or
  null outside *New* and for an undated *New*) and `lifecycle_undated`.
- The rule as two SQL functions the view calls, `customer_lifecycle_stage` and
  `customer_lifecycle_delivery`, each taking `now` as an argument, so a check can call them with
  a table of cases. Server-only: execute revoked from `public`, `anon` and `authenticated`.
- The thresholds as constants in one module, `lib/crm/lifecycle-stage.ts`, with pure
  `lifecycleStage` and `lifecycleDelivery` that the functions mirror. A vitest test reads the
  migration and holds its intervals equal to the constants; `lib/crm/lifecycle-stage.check.ts`
  holds the SQL and TypeScript equal over a table of cases and the view over a fixture, against a
  database with every migration applied, in a transaction that is rolled back.
- The *Last order* filter and the *Last order* sort and column move onto `last_purchase_at` in the
  same change. Production has no saved Segment, so none changes meaning.
- A `stage=` filter (comma list: `lead,new,repeat,loyal,at-risk,lapsed`) in
  `customerFiltersSchema`, so Segments and links carry it. Additive: `SEGMENT_FILTERS_VERSION`
  stays 2.
- A *Stage* column on the Customers list, a *Stage* control in its filters, and the stage in the
  Customer detail's header and Stats card, with purchases and the last purchase.
- `CONTEXT.md`: **Lifecycle stage**, with each stage's rule.

## Known limits (independent review, 2026-10-27)

- **A full return by RMA can leave a Customer *New*.** An RMA refunds the line prices and keeps
  shipping (`lib/rma/refund.ts`), so the Order ends `partially_refunded`, which is still a
  purchase. The stage reads Order status only, as decided (never returns). For the owner: count
  an Order whose every goods line was returned as no purchase, or leave it.
- **The list's *Orders* column is `customers.total_orders`**, which counts a paid re-adjustment fee;
  *Last order* and the stage count purchases. A Customer whose only Order is a fee shows Orders 1,
  Last order —, Stage *Lead*.
- **Deploy order:** the app selects the new columns, so the migration goes to production before
  the code. Before it, the Customers list reads as empty and a Segment using *Last order* fails.
  The migration on its own is safe with the code before this slice.

## Acceptance criteria

- [ ] The stage reads Orders only (and, until slice 09, the Shopify-era count): never reviews,
  ratings, returns or notes (PRD decision 4).
- [ ] A refund that leaves no purchase moves the Customer back to *Lead*.
- [ ] A paid re-adjustment never moves a Customer to *Repeat*.
- [ ] A Shopify-only buyer is *New*, *Repeat* or *Loyal* by count, marked *no dates yet*, never
  *At risk* or *Lapsed*.
- [ ] A Segment saved before this slice still parses, unchanged.
- [ ] The overview test fails if the view and `CUSTOMER_OVERVIEW_COLUMNS` disagree.
- [ ] The SQL functions and the TypeScript agree on every case, boundaries included.
