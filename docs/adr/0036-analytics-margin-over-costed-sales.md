# Analytics tracks this site's sales as Stripe took them, and margin is over costed sales

Status: Accepted (2026-10-28, revised 2026-10-29)

## Context

Analytics reported a realized margin of 86.6% for May–Oct 2026, from the Shopify order mirror.
Three errors produced it:

- **A sale with no cost counted as costing $0.** `order_margins` and the mirror aggregate summed
  `coalesce(total_cost, 0)`. $37,216 of the $86,306 of sales in the period had no cost, so all of
  it read as profit.
- **Months were the server's, not Singapore's.** The client sent Singapore month bounds, and the
  server re-snapped them to UTC midnight, which added April to a May–Oct range.
- **Reads stopped at 1,000 rows.** The inventory waterfall read one page of a 2,389-row ledger.

Shop checkout also costed a customised pillow from its recipe, which carries no fillings
(ADR 0003). The margin charts read Costings in the browser and multiplied today's cost and MSRP
by units sold, a figure no sale was made at.

A sale's time was our own: `orders.paid_at` was stamped when the webhook ran (Stripe retries a
failed one for days) or when Accept ran, which for a Balance payment can be long after the
customer paid.

## Decision

- **Analytics tracks this site's sales only.** Shopify is not read, and the channel toggle is
  gone (supersedes ADR 0006's channel decisions; 2026-10-29).
- **A Sale is an Order Stripe has charged, dated by Stripe.** The money ledger (`order_payments`)
  records `occurred_at`, Stripe's own time for the money: the event's `created` for a checkout
  payment, refund or dispute, and the capture's balance transaction for a Result's hold or Balance
  payment. A Sale is dated by its latest charge, when Stripe held the whole price. `orders.paid_at`
  takes the same Stripe time.
- **Margin % is gross margin over costed revenue.** Revenue with no cost stays in Revenue, never
  counts as $0 cost, and is shown as Cost coverage with a list of the sales that have none.
- **One set of sold lines feeds every money figure** (`lib/analytics/sold-lines.ts`): realised
  revenue spread over each Order's lines, and the cost frozen on each line.
- **A sale is costed from the stock it took**: the Items `stockLinesForOrderItem` deducts,
  fillings included. Shop checkout, staff-made Orders and re-adjustment Service lines now freeze
  their cost the way Result accept already did.
- **Analytics months are Singapore months**, and every Analytics read pages.
- **The page is split by the reader's question**: Sales & margin, Stock & builds, Customers,
  Traffic & search. On-hand stock value stays on Costings (ADR 0006).

## Considered options

- **Date a sale by `paid_at` as it was.** Rejected: it was the time our code ran, not the payment.
- **Ask Stripe for each sale's time when Analytics loads.** Rejected: Analytics reads the database
  only (ADR 0006); the time is recorded once, when the money moves.
- **Margin % over all revenue.** Rejected: it reports every missing cost as profit.
- **Keep the Shopify half, read as stored.** Rejected 2026-10-29: tracking starts with this site.

## Consequences

- Analytics shows nothing before this site's first Stripe sale; Shopify-era sales are not on it.
- `order_payments.occurred_at` must exist before the code that writes it is deployed (migration
  `20261029010000`).
- The Shopify mirror's ingest still runs and feeds nothing (`docs/data-flows/analytics.md`).
- Cost coverage says how much of the margin is known. Fixing a cost raises coverage without anyone
  touching Analytics.
