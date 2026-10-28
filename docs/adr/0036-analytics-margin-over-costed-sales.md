# Analytics margin is over costed sales, and a platform sale is costed from the stock it took

Status: Accepted (2026-10-28)

## Context

Analytics reported a realized margin of 86.6% for May–Oct 2026. Three errors produced it:

- **A sale with no cost counted as costing $0.** `order_margins` and the mirror aggregate summed
  `coalesce(total_cost, 0)`. $37,216 of the $86,306 of sales in the period had no cost, so all of
  it read as profit.
- **Months were the server's, not Singapore's.** The client sent Singapore month bounds, and the
  server re-snapped them to UTC midnight, which added April to a May–Oct range.
- **Reads stopped at 1,000 rows.** The inventory waterfall read one page of a 2,389-row ledger.

Shop checkout also costed a customised pillow from its recipe, which carries no fillings
(ADR 0003). The margin charts read Costings in the browser and multiplied today's cost and MSRP
by units sold, a figure no sale was made at.

## Decision

- **Margin % is gross margin over costed revenue.** Revenue with no cost stays in Revenue, never
  counts as $0 cost, and is shown as Cost coverage with a list of the sales that have none.
- **One set of sold lines feeds every money figure** (`lib/analytics/sold-lines.ts`): realised
  revenue spread over each order's lines, and the cost frozen on each line. The totals, the
  breakdowns and the timeline are sums of the same lines.
- **A platform sale is costed from the stock it took**: the Items `stockLinesForOrderItem`
  deducts, fillings included. Shop checkout, staff-made Orders and re-adjustment Service lines
  now freeze their cost the way Result accept already did.
- **The Shopify order mirror is read as stored.** No Shopify work: Analytics changes neither how
  the mirror is costed nor how it is netted; it stays the read-only input it was (CLAUDE.md).
- **Analytics months are Singapore months**, and every Analytics read pages.
- **The page is split by the reader's question**: Sales & margin, Stock & builds, Customers,
  Traffic & search. On-hand stock value stays on Costings (ADR 0006).

## Considered options

- **Margin % over all revenue.** Rejected: it reports every missing cost as profit.
- **Re-cost or re-net the Shopify mirror** (fillings in its pillow costs, discounts capped at
  what the customer paid). Rejected: no Shopify work, and the mirror gains no features (CLAUDE.md).

## Consequences

- Cost coverage says how much of the margin is known. Fixing a cost raises coverage without
  anyone touching Analytics.
- Shopify sales show the margin the mirror recorded. Its pillow costs leave out fillings, so a
  Shopify pillow's margin reads high; the platform's does not.
