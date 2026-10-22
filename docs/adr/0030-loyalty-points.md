# Points are a dollar offset kept in an append-only ledger, earned on what was kept and spent only on shop orders

Status: Accepted (PRD `loyalty-points`, 2026-10-21)

Customers buy a pillow every two to four years and accessories in between. The Shopify migration
needed a reason to sign in, and the Welcome-back voucher (ADR 0029 (g)) gave one only at the
**Claim**. It existed once, did nothing after it was spent, and could never reach anyone who
claimed while it was switched off. This record replaces it with **Points**: a balance each
**Customer** earns on what they pay for and spends as dollars off a later shop **Order**, with a
one-time **Claim bonus** for Migrated customers.

## Context

- **Discounts already sum into one.** Partner self-purchase pricing is added to the coupon's
  discount and sent to Stripe as one `amount_off` coupon (`app/api/shop/checkout/route.ts`;
  `lib/stripe/checkout.ts`). The Order keeps one `discount_amount`. Tax and the paid-time
  reconcile agree with whatever that sum is.
- **Coupons reserve nothing.** `usage_count` moves only after payment. ADR 0029 (j) accepted that
  for a one-use voucher bound to one person; a balance can be spent twice from two tabs.
- **Results take no discount.** Every pricer of a custom pillow hard-codes `discountAmount: 0`,
  Accept writes `discount_amount: 0`, and `planCapture` refuses an amount of zero or less.
- **Refunds already pay cash only,** each capped at `amount_captured − amount_refunded`, and an
  RMA refunds a returned line at its `unit_price` up to the cash left.
- **Partner commission waits 30 days after delivery** (`lib/rma/eligibility.ts`,
  `lib/commissions`), so most refunds land before it is released.
- **The daily job has room for runners but not for a third cron** (`vercel.json`); Aftercare
  chains onto `results-sla`. `customer_emails` sends each email once per (Customer, template,
  entity).
- **The customer can read their own `customers` row** (ADR 0029 (d)).

## Decisions

The owner's decisions of 2026-10-21, as the PRD lists them:

1. Points are a dollar offset and nothing else: 100 points = S$1, spent as money off a purchase.
   No tiers, no catalogue, no cashing out, transferring or buying.
2. They are earned on purchases, plus a one-time Claim bonus for Migrated customers.
3. The earn rate is 3 points per S$1.
4. They are spent on shop orders only. Results earn but cannot take them.
5. GST does not count.
6. Only Orders paid from launch earn.
7. Points used are never refunded; a partial return treats them as spent on what was kept.
8. The balance expires 24 months after the last purchase, with reminders 3, 2 and 1 months
   before.
9. Reminders go only to customers who agreed to marketing email.
10. The Claim bonus is 1,000 points (S$10).
11. Its window is 3 months from the customer's first campaign email, or from the first wave if we
    never emailed them; there is no calendar end date.
12. Partners neither earn nor spend points.
13. Partner commission stays on the full price.
14. The voucher feature is deleted; any future code-based incentive is an ordinary Discounts
    code.
15. Nothing is built for Shopify.

The rules that implement them, (a) to (r), are the PRD's *Rules* section, unchanged:

- **Value.** (a) 100 points = S$1 is a constant in code, never a setting. (b) A balance is always
  shown in points and dollars.
- **Earning.** (c) `floor(rate × (subtotal − discount_amount − amount_refunded))`, floored at 0.
  (d) Pending for 30 days after `delivered_at` (`paid_at` for service-only Orders), then one
  `earn` entry from the daily job. (e) Shop, Result and paid Re-adjustment Orders paid since
  `points_launch_at`; never a partner's self-purchase or a partner Customer's Order.
- **Claim bonus.** (f) Granted once, if the Claim fell inside the window. (g) A Claim before
  launch is granted at the next sign-in.
- **Spending.** (h) A signed-in, non-partner Customer checking out with their own account email.
  (i) In 100-point steps from 500, at most half the products' price after any coupon, never
  shipping. (j) Reserved by one SQL function holding a row lock on the Customer; given back when
  the Checkout expires or its payment fails. (k) Shop orders only.
- **Refunds and adjustments.** (l) Refund code does not change. (m) A refund after release claws
  back `floor(rate × refund)`, no more than earned or available. (n) Staff adjust with a reason;
  never for a partner.
- **Expiry.** (o) The whole balance, 24 months after the last paid Order or the Claim bonus.
  (p) Reminders at 3, 2 and 1 months, to `subscribed` Customers only, once per clock.
- **Storage and partners.** (q) `points_ledger` is append-only and server-only; the balance is
  never a column on `customers`. (r) A Customer is a partner when an approved `partner_users` row
  holds their login or their email (or verified backup email), matched as `loadPartnerRow`
  matches. `is_partner_customer` is the one answer.

## Considered options

- **Keep the voucher.** Rejected. It exists only at the Claim, and rewards nothing after it.
- **Expire each earning 12 or 24 months after it was earned.** Rejected. Pillows are bought every
  two to four years, so batch expiry wipes most pillow-earned points before the customer returns,
  and it needs first-in-first-out lots.
- **Spend on Results in v1.** Rejected. It changes the hold amount, six pricers, the hold endings
  and the capture plan. Earning on Results is kept: it reads only the paid Order.
- **A balance column on `customers`.** Rejected. The customer can read their own row, and a stored
  total drifts from its history.
- **No reservation, as coupons have none.** Rejected for a balance: two tabs could spend it twice.
- **Split points across order lines so a return refunds its points share.** Rejected by the owner.
  A return refunds cash first and the points stay spent, which needs no refund change.
- **Account-bound coupons as the incentive.** Rejected by the owner (decision 14).
- **Points for partners.** Rejected by the owner: partners have milestone tiers.

## Consequences

- One ledger explains every balance; Staff corrections are new `adjust` entries with a reason.
- Checkout gains a reservation and two release points; refunds are untouched.
- The Shopify migration's incentive is the Claim bonus (ADR 0029 (g), amended 2026-10-21).
- Counsel and the accountant review the terms and the liability before launch (PRD slice 08);
  their answers are added here, dated.
