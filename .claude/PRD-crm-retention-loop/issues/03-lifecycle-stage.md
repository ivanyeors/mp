# 03 — A lifecycle stage on every Customer: Lead, New, Loyal, At risk, Lost

**Issue:** [#339](https://github.com/ivanyeors/mp/issues/339)
**Type:** AFK
**Status:** first built 2026-10-27 as six stages (migration `20261028033330_lifecycle_stage.sql`,
applied to production 2026-10-28); reworked on `claude/crm-loop-handoffs-dropoff` into the owner's
five-stage funnel (owner decision 4, 2026-10-28) by migration `20261028084009_lifecycle_funnel.sql`,
applied to production 2026-10-28. `20261028084152_drop_six_stage_lifecycle_functions.sql`, which
drops the six-stage functions, is not applied yet
**Blocked by:** none. Thresholds settled 2026-10-27 (owner decision 1); the funnel 2026-10-28
(owner decision 4). Slice 09 brings Shopify-era dates; this slice does not wait for it.
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:db`

## Goal

Every Customer has one stage in the funnel, with a sub-status where the stage has one, and the
list filters by stage. The demo: filter *Stage: At risk*, save it as a Segment, and it is a
campaign Audience.

## The funnel

Owner, 2026-10-28: *Lead > New > Loyal (subscribers / repeat purchases / bookings) > At risk
(Lapsed) > Lost*, where the brackets are sub-statuses within the main stage. A Customer does not
have to pass through every stage: a one-time buyer who goes quiet goes from *New* to *At risk*, a
*Lead* who unsubscribes goes to *Lost*.

| Stage | Sub-status | Rule |
|---|---|---|
| *Lead* | | No purchase and no attended booking yet, subscribed to email or not |
| *New* | *Awaiting delivery*, *Delivered*, *Settled* | 1 purchase, subscribed to email or not |
| *Loyal* | *Repeat purchases*, *Bookings* (*Subscriber* comes with Renew) | 2 or more purchases, or an attended booking |
| *At risk* | *Lapsed* | No purchase or attended booking for over 12 months; *Lapsed* over 24 |
| *Lost* | | Unsubscribed from marketing, with no purchase or attended booking since |

Each Customer is in exactly one stage, checked in this order:

1. ***Lost***: `marketing_email` is `unsubscribed` and no purchase or attended booking is later
   than the unsubscribe (`marketing_email_updated_at`). The owner's rule is "cancels the
   subscription and unsubscribes from email / all marketing communications". Renew does not exist
   yet, so nobody has a subscription to cancel, and unsubscribing is enough. Marketing email is
   the only marketing channel today (WhatsApp carries service messages only). *Lost* is not for
   good: buying, attending a booking, or turning email back on in their account moves them out.
   A spam complaint unsubscribes too (source `complaint`), so it also makes a Customer *Lost*.
2. ***Lead***: no purchase and no attended booking.
3. ***At risk***: the latest purchase or attended booking is more than 12 calendar months ago;
   *Lapsed* when it is more than 24. Not for a buyer with no dates yet (below).
4. ***Loyal***: 2 or more purchases (*Repeat purchases*), or at least one attended booking
   (*Bookings*). With both, the sub-status is *Repeat purchases*: the strongest reason shows,
   *Subscriber* first once Renew exists, then *Repeat purchases*, then *Bookings*.
5. ***New***: otherwise, one purchase.

**When Renew exists** (another piece of work), an active subscriber is *Loyal · Subscriber*,
checked before *Lost*: a subscriber who turns off promotional email is still a subscriber, and is
never *At risk* while subscribed. Cancelling Renew while still subscribed to email is not *Lost*;
where that Customer goes is decided with Renew (recommended: *At risk*, the win-back group).

### What each rule reads

- **A purchase** is a counted Order (paid, not pending, cancelled, refunded or payment-failed, as
  `isCountedOrder` and the overview's `paid_orders` already count) with at least one goods line
  (`order_items.kind = 'goods'`). A re-adjustment fee Order, all service lines, is not one.
- **An attended booking** is a **Re-adjustment booking** (`readjustment_bookings`) with status
  `attended`: a re-adjustment, complimentary or paid, including one booked from the yearly
  check-up reminder. Booked, no-show, cancelled and expired bookings do not count. Its date is
  `start_at`. (Not a **Visit**, which in `CONTEXT.md` is a browsing session.) Production had no
  Re-adjustment bookings on 2026-10-28.
- **Unsubscribed** is `customers.marketing_email = 'unsubscribed'`, dated by
  `marketing_email_updated_at`. Only the customer (by link, by account or by complaint) or Staff
  on their request can set it; the Shopify import never does (`20261020120000_marketing_consent.sql`).

Months are calendar months counted the way Postgres counts `now() - interval '12 months'` in
UTC, which `monthsBefore` already mirrors for the *Last order* filter. The cut-offs are strict: a
purchase exactly 12 months ago is not yet *At risk*, and exactly 24 is not yet *Lapsed*.

**New's sub-status is its delivery**, from that one purchase's `delivered_at`: *awaiting
delivery* (not delivered yet), *delivered* (under 30 days ago), *settled* (30 days or more, when
the return window closes, as Points release, ADR 0011). `delivered_at` is stamped by the courier
webhook, an in-store handover and Staff marking the Order delivered.

**Shopify customers are in the same stages** (owner, 2026-10-27). Until slice 09 imports their
order dates, a Migrated customer's Shopify-era order count (`migrated_customers.shopify_orders_count`)
is added to their purchases here. A Customer whose every purchase is Shopify-era is placed by
count (*New* or *Loyal*) and marked *no dates yet* (`lifecycle_undated`); they cannot be *At risk*
until their dates exist. They can be *Lost*. Slice 09 replaces the count with the imported Orders,
and must stop adding it in the same change.

Production on 2026-10-28 (2,161 Customers): *Lead* 544, *New* 1,278, *Loyal* 339 (all *Repeat
purchases*), *At risk* 0, *Lost* 0. No platform purchase is dated yet, no booking has been attended
and nobody has unsubscribed, so *At risk* and *Lost* fill as slice 09 lands and time passes.

## What to build

The first build (2026-10-27) added `purchases`, `last_purchase_at`, `lifecycle_stage`,
`lifecycle_delivery` and `lifecycle_undated` to `admin_customer_overview`, two SQL functions,
`lib/crm/lifecycle-stage.ts`, the `stage=` filter, the *Stage* column and control, and the stage
on the Customer detail. The rework changes them in place:

- **Migration `20261028084009_lifecycle_funnel.sql`.**
  - `customer_lifecycle_stage(purchases, last_purchase_at, bookings, last_booking_at,
    unsubscribed_at, now)` returns `lead`, `new`, `loyal`, `at_risk` or `lost`.
  - `customer_lifecycle_detail(purchases, last_purchase_at, last_purchase_delivered_at, bookings,
    last_booking_at, unsubscribed_at, now)` returns the sub-status: `awaiting_delivery`,
    `delivered`, `settled`, `repeat_purchases`, `bookings`, `lapsed`, or null.
  - Both server-only, as before: execute revoked from `public`, `anon` and `authenticated`.
  - The old three- and four-argument functions are no longer called, and are dropped by a
    migration of their own, `20261028084152_drop_six_stage_lifecycle_functions.sql`. The Supabase
    connector asks for a confirmation before a drop, and that confirmation did not reach the
    owner, so the funnel was applied without the drop. Until the drop is applied the old
    functions stay in production, unused. Apply it with `supabase db push` or the SQL editor; if
    it is applied through the connector, rename the file to the version production records.
  - On the overview, `lifecycle_delivery` is renamed `lifecycle_detail` and `attended_bookings`
    is appended. The latest one's date is the existing `last_readjusted_at`. Every other column keeps its place and expression.
- **`lib/crm/lifecycle-stage.ts`**: the five stages, the six sub-statuses, the thresholds, and
  pure `lifecycleStage` and `lifecycleDetail` that the functions mirror. The vitest test that
  reads the migration and the database check (`lib/crm/lifecycle-stage.check.ts`) are rewritten
  for the new rule.
- **The `stage=` filter** takes `lead,new,loyal,at-risk,lost`. Production has no saved Segment,
  so nothing saved changes meaning. Additive to the schema: `SEGMENT_FILTERS_VERSION` stays 2.
- **On the list and the Customer detail**, the badge shows the stage, and the line under it the
  sub-status (*Repeat purchases*, *Lapsed*, *Delivered*…), *no dates yet*, or for *Lost* the day
  they unsubscribed. The detail's Stats card adds *Bookings attended*.
- `CONTEXT.md`: **Lifecycle stage** rewritten, reading **Purchases**, attended **Re-adjustment
  bookings** and **Marketing consent**.

The *Last order* filter, sort and column stay on `last_purchase_at`.

## Known limits

- **A full return by RMA can leave a Customer *New*.** An RMA refunds the lines' share of the goods
  price after coupons on a plain shop Order (their list price on any other), in cash, and where
  that share runs with no points it keeps shipping (`lib/rma/refund.ts`), so the Order ends `partially_refunded`, which is still a
  purchase. The stage reads Order status only, as decided (never returns). For the owner: count
  an Order whose every goods line was returned as no purchase, or leave it.
- **The list's *Orders* column is `customers.total_orders`**, which counts a paid re-adjustment fee;
  *Last order* and the stage count purchases.
- **No reason is recorded for *Lost* yet.** Asking why on the unsubscribe page is slice 11.
- **The Stage filter chooses main stages only.** Choosing a sub-status, such as *Lapsed* for
  slice 07's *Welcome back*, comes with slice 07.
- **Deploy order:** the app selects `lifecycle_detail` and `attended_bookings`, so the migration goes to
  production before the code. The migration on its own is safe with the code on `main`, which
  reads none of the lifecycle columns.

## Acceptance criteria

- [ ] The stage reads purchases, attended bookings and marketing consent only (and, until slice 09,
  the Shopify-era count): never reviews, ratings, returns or notes (PRD decision 5).
- [ ] A refund that leaves no purchase, and no attended booking, moves the Customer back to *Lead*.
- [ ] A paid re-adjustment fee is never a purchase; the booking it paid for, once attended, makes
  the Customer *Loyal · Bookings*.
- [ ] An unsubscribe makes the Customer *Lost*; a later purchase, a later attended booking or
  subscribing again moves them out.
- [ ] A Shopify-only buyer is *New* or *Loyal* by count, marked *no dates yet*, never *At risk*.
- [ ] The overview test fails if the view and `CUSTOMER_OVERVIEW_COLUMNS` disagree.
- [ ] The SQL functions and the TypeScript agree on every case, boundaries included.
