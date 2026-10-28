# Analytics margin is over costed sales, and a sale is costed from the stock it took

Status: Accepted (2026-10-28)

## Context

Analytics reported a realized margin of 86.6% for May–Oct 2026, from four errors that each pushed
it up or blurred it:

- **A sale with no cost counted as costing $0.** `order_margins` and the mirror aggregate summed
  `coalesce(total_cost, 0)`. $37,216 of the $86,306 of Shopify sales had no cost, so all of it
  read as profit. Every Premium Mpillow S and XS was among them: their recipes hold a Zip Lock Bag
  with no cost price, and one missing cost leaves the whole line uncosted.
- **A pillow was costed without its fillings.** The mirror and shop checkout costed a pillow or
  bolster from its recipe, and a recipe carries no fillings (ADR 0003). A Shopify Premium M was
  costed at $35.35, though its build used $59.75 of stock.
- **Months were the server's, not Singapore's.** The client sent Singapore month bounds, and the
  server re-snapped them to UTC midnight, which added April to a May–Oct range.
- **Reads stopped at 1,000 rows.** The inventory waterfall read one page of a 2,389-row ledger.

The margin charts also read Costings in the browser and multiplied today's cost and MSRP by units
sold on Shopify only, a figure no sale was made at.

## Decision

- **Margin % is gross margin over costed revenue.** Revenue with no cost stays in Revenue, never
  counts as $0 cost, and is shown as Cost coverage with a list of the gaps, each with its reason
  and the page that fixes it.
- **One set of sold lines feeds every money figure** (`lib/analytics/sold-lines.ts`): realised
  revenue (after discounts and refunds) spread over each order's lines, and the cost frozen on
  each line. The totals, the breakdowns and the timeline are sums of the same lines, for both
  channels.
- **A sale is costed from the stock it took.** Platform lines freeze the cost of the Items
  `stockLinesForOrderItem` deducts. A Shopify pillow or bolster is costed from its warehouse
  template (the build the Shopify sales queue deducted), else its recipe plus its Default Filling
  Template. `scripts/recost-shopify-mirror.ts` corrects the Shopify lines frozen without their
  fillings, once; this overrides the freeze rule (ADR 0006) because the frozen figure was wrong,
  not out of date.
- **Analytics months are Singapore months**, and every Analytics read pages.
- **The page is split by the reader's question**: Sales & margin, Stock & builds, Customers,
  Traffic & search. On-hand stock value stays on Costings (ADR 0006).

## Considered options

- **Treat an uncosted Item as $0 in the Shopify build, as Costings does.** Rejected for the
  mirror: a line frozen with a partial cost would never re-cost when Costings gains the missing
  price. The platform keeps the $0 rule, which Result accept already uses.
- **Margin % over all revenue.** Rejected: it reports every missing cost as profit.
- **Read the Shopify discount from Shopify.** Rejected: the mirror gains no features (CLAUDE.md).
  What the customer paid caps revenue instead.

## Consequences

- The margin falls once the mirror is re-costed, and Cost coverage says how much of it is known.
  Fixing a cost in Costings raises coverage without anyone touching Analytics.
- Gift vouchers sold on Shopify still count as revenue when sold, and Shopify's service Items are
  costed at their MSRP in Costings. Both are listed under Known gaps in
  `docs/data-flows/analytics.md`.
