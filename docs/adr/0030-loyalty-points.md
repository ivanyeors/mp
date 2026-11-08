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
8. ~~The balance expires 24 months after the last purchase, with reminders 3, 2 and 1 months
   before.~~ Retired 2026-10-31: points never expire (amendment below).
9. ~~Reminders go only to customers who agreed to marketing email.~~ Retired with 8.
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
- **Expiry.** ~~(o) The whole balance, 24 months after the last paid Order or the Claim bonus.
  (p) Reminders at 3, 2 and 1 months, to `subscribed` Customers only, once per clock.~~ Retired
  2026-10-31: points never expire (amendment below).
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

## Amendment (2026-10-23): bonus milestones

The owner wants points to make customers buy more: once a customer has earned a certain number of
points, we add more, and the Profile shows it as a progress bar with the milestones on it.

**Decision 16.** Customers get a one-time bonus as the points they earn from orders add up, on a
ladder the owner sets (PRD slice 09). Decision 1 stands: a milestone is not a tier. Nothing about
earning or spending changes after it, nothing is taken away, and the bonus is the whole reward.

- **(s) The ladder.** Up to five milestones, each a number of points earned and a bonus, both in
  multiples of 100 and climbing, in one setting (`points_milestones`). Missing, blank or
  malformed is no milestones, never a default, so a bonus is only granted on a ladder that was
  saved.
- **(t) What counts.** Every `earn` less every `clawback`. Counting the balance would set a
  customer back for using points, so spending and expiry don't. The Claim bonus, Staff
  adjustments and milestone bonuses don't move the bar.
- **(u) One bonus per milestone reached,** numbered from 1, held unique per Customer, so changing
  the ladder never pays a milestone twice.
- **(v) A bonus is never taken back,** even if a refund later takes the customer below its
  milestone.
- **(w) The daily job grants them** right after it releases earned points, only while points are
  live, under the per-Customer lock, and never to a partner. Pending points show on the bar but
  count only once written, so a bonus never rests on an order that can still be returned.

**Considered.**

- *Counting the balance:* rejected, because it punishes spending.
- *A yearly reset:* rejected, because pillows are bought every two to four years.
- *Granting at payment:* rejected, because a return inside the window would leave the bonus
  behind.
- *Keying a bonus on its number of points rather than its place on the ladder:* rejected,
  because raising a milestone would then pay customers already past the old one a second time.

**Consequences.** The ledger has an eighth kind, `milestone_bonus`, and a `milestone` column.
The cost summary counts the bonuses. The terms gained a section and are dated 23 October 2026.
The partner **Milestone track** is unchanged and separate.

## Amendment (2026-10-31): points never expire

The owner removed expiry from the points system: no expiry date, anywhere.

**Decision 17.** Points never expire. A balance is kept however long it is between orders. This
retires decision 8 (the 24-month clock) and decision 9 (its reminders), and rules (o) and (p).

- **Nothing expires a balance.** `expire_points`, `expire_due_points`, the clock
  (`points_clock`, `points_expires_on`) and the daily job's expiry step are gone, and the ledger
  has no `expire` kind.
- **Nobody is reminded.** The three `points.expiry_*` emails, their copy and their registry
  entries are gone. The check-up reminder keeps its consent gate (`requireMarketingConsent`),
  which no other email now shares.
- **No date is shown.** `points_balance()` returns `available` and `pending` only. The Profile
  says the points don't expire; the Staff card, the terms and the Staff guide show no date.
- **No setting.** `points_expiry_months` is gone from `site_settings`, `points_settings()` and
  Settings → Discounts → Points, and the cost summary loses its `expired` lines.

**Why it was safe to delete rather than wind down.** When this was decided, production had points
switched off, an empty ledger, no expiry email sent and no saved copy for one. Nothing had
expired, so nothing is reinstated. The migration (`20261031032017_points_never_expire.sql`)
refuses to run on a database that does hold an `expire` entry, because the ledger is
append-only and those points would have to be given back with `adjust` entries first.

**Considered.**

- *Keep expiry but set it very long (say 120 months):* rejected. The owner asked for no expiry
  date, and a far-off date is still a date to explain, remind about and carry as a liability
  rule.
- *Keep the `expire` kind for history:* rejected. No entry of that kind exists, and keeping it
  would let code write one again.

**Consequences.** The terms gained a "Points don't expire" section and are dated 31 October 2026.
The change only adds to what customers keep, and points were not yet live. The liability points create no longer
shrinks through expiry, so what customers hold only falls when they spend or a refund claws
back: the accountant should know (slice 08). The CRM's *Lapsed* sub-status still starts at 24
months without a purchase: it was set when points expired at 24 months, and is a separate
retention rule that this amendment does not change.

## Amendment (2026-11-08): points for past purchases

The owner wants customers imported from the old shop to start with points for what they already
bought there, not only with the Claim bonus.

**Decision 18.** A **Migrated customer** is given **Past-purchase points** once: the earn rate ×
their Shopify-era spend (`migrated_customers.shopify_amount_spent`), rounded down. This narrows
decision 6 ("only Orders paid from launch earn"): Orders are unchanged, and the Shopify era is
settled once from what the platform already holds, as `CLAUDE.md` directs for Shopify-era facts.
It is built on the Shopify export the customer import stored, and reads nothing from Shopify, so
decision 15 stands.

The owner's choices, 2026-11-08:

- **(x) Staff give them, in one run,** from Settings → Discounts → Points: a preview first (how
  many customers, how many points and what they are worth, the median and the largest), then a
  confirmation, then the run. The run sends the preview's numbers back, and the database grants
  only if they are still the numbers (`grant_past_purchase_points`), so what Staff confirmed is
  what is granted. Not gated on points being on: with points off, customers see nothing until
  launch.
- **(y) Once per Customer,** held unique (`points_ledger_one_past_purchases`). Running it again
  grants only customers imported since. A run is not reversible in one step: the ledger is
  append-only, so a correction is an `adjust` entry.
- **(z) They never count towards a Milestone bonus.** Rule (t) counts `earn` less `clawback`;
  this is a ledger kind of its own, `past_purchases`. Partners get none (rule r).

**Considered.**

- *At each customer's Claim, with the Claim bonus:* rejected by the owner. It would have kept what
  is owed down to customers who come back, but balances would only appear at sign-in.
- *Counting them towards milestones:* rejected by the owner. In production 1,258 customers would
  have passed the first milestone at once, adding 173,600 points (about S$1,736).
- *Writing them as `earn` entries:* rejected. `earn` is one per Order, and milestones count it.
- *Excluding shipping:* not possible. The export's spend is one total per customer, shipping
  included, so a past purchase earns on a little more than an Order here would.

**What it costs.** In production on 2026-11-08: 1,613 Migrated customers with spend,
2,379,749 points at 3 per S$1 (about S$23,797). The median grant is about 1,374 points
(S$13.74), the largest 25,336 (S$253.36). No partner had Shopify-era spend. The accountant should
know before the run: it is a liability from the day it is given (slice 08).

**Consequences.** The ledger has a ninth kind, `past_purchases`, labelled "Points for past
purchases" on the Staff card with the spend in its note. The cost summary counts the grants. The
terms gained a "Points for past purchases" section and are dated 8 November 2026; counsel reviews
it with the rest before launch. The Staff guide's launch checklist gives the points before
launch, so a customer's balance is there at their first sign-in.
