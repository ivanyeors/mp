# PRD — Loyalty points

**Status:** specified, not started
**Builds on:** `PRD-shopify-customer-migration` and `PRD-customer-crm`, both on
`claude/shopify-migration-plan-izv7fo` @ `c6155da3`. Every line reference below is to that
branch. Start building once it merges.
**ADR:** `docs/adr/0030-loyalty-points.md`, written by slice 01 (0028 went to the CRM and 0029 to
the migration; take the next free number if either moves).
**Owner decisions:** taken 2026-10-21, listed below. Still open: see
[Open decisions](#open-decisions-for-the-owner).

## Problem statement

The Shopify migration needs a reason for customers to sign in. Its plan gives each one a
**Welcome-back voucher** at their **Claim** (migration slice 05). That is built, switched off,
and has two weaknesses:

- **It exists only at the moment of the Claim.** A Claim happens once. Anyone who claims while
  the voucher is off never gets one (`20261020112100_welcome_back_voucher.sql:100-106`), which is
  why the migration says to set its terms before the production import.
- **It rewards nothing after it is spent.** Customers buy a pillow every two to four years and
  accessories in between. Nothing gives them a reason to come back to this shop rather than
  another.

Points replace the voucher. Customers earn a balance on what they pay for and spend it as dollars
off a later shop order. The Claim gives each **Migrated customer** a starting balance.

## Owner decisions (2026-10-21)

1. **Points are a dollar offset and nothing else.** 100 points = S$1, spent as money off a
   purchase. There are no tiers, no rewards catalogue, and no cashing out, transferring or buying
   points.
2. **Points are earned on purchases, plus a one-time Claim bonus** for Migrated customers.
3. **The earn rate is 3 points per S$1 (3%).**
4. **Points are spent on shop orders only.** Custom pillows (**Results**) earn points but cannot
   take them.
5. **Points used to buy products are never refunded.** A refund returns cash only.
6. **GST does not count.** Points are earned on, and taken off, the price before GST. Mellow Life
   is not GST-registered (`20260630130000_disable_gst_until_registered.sql:4-6`).
7. **Points expire 24 months after the customer's last purchase,** with reminder emails 3, 2 and
   1 months before.
8. **Nothing is built for Shopify** (CLAUDE.md, *Shopify is being replaced*). Points exist on
   this platform only.

## What the code already does, before designing anything

### 1. Shop checkout already folds several discounts into one

- **Discounts already add up into one figure.** Partner self-purchase pricing is added to the
  coupon's discount and goes to Stripe as one `amount_off` coupon, labelled
  "CODE + Partner pricing" (`app/api/shop/checkout/route.ts:613-641`;
  `lib/stripe/checkout.ts:187-195`). Points join the same sum. Tax (`lib/ecommerce/tax.ts:103-114`)
  and the paid-time reconcile (`lib/stripe/reconcile.ts:71-83`) then agree without change.
- **The Order does not record where its discount came from.** It keeps one `discount_amount`
  (`0028_ecommerce.sql:395-401`), and `order_items` has no discount column at all.
- **Thresholds ignore discounts.** Free shipping and a coupon's minimum are both judged on the
  subtotal before discounts (`route.ts:576,596`; `lib/ecommerce/discounts.ts:265`). Points
  leave both alone.
- **Points need a reservation; coupons never had one.** `usage_count` moves only after payment
  (`app/api/stripe/webhook/route.ts:378-386`). ADR 0029 (j) accepts that for a one-use voucher
  bound to one person. A balance is different: two tabs could spend it twice.
- **An unpaid Checkout already ends in a handled webhook,** and that is where a reservation is
  given back:
  - `checkout.session.expired` cancels the pending Order (`webhook/route.ts:474-510`);
  - `async_payment_failed` marks it `payment_failed` (`:446-472`).

### 2. Custom pillows cannot take a discount, and should not in v1

- **Every Result pricer hard-codes no discount.** The hold prices with `discountAmount: 0`
  (`app/api/results/hold/route.ts:648-651`). So do the paired hold
  (`lib/results/paired-hold.ts:118`), assign, `loadAssignedBuild`, the Result status page and the
  configurator preview.
- **Accept and capture assume it too.** Accept writes `discount_amount: 0`
  (`app/api/results/[id]/accept/route.ts:481`), and `planCapture` refuses any amount of zero or
  less (`lib/authorization-hold/settlement-plan.ts:29`).
- **Spending there is a large change.** It would alter the hold amount and six pricers, and add a
  points give-back to all seven ways a hold ends.
- **Earning is small.** It reads the paid Order that Accept already writes.

### 3. Refunds already pay back cash only, up to what was captured

- **Full refunds already follow decision 5.** Every refund path caps at
  `amount_captured − amount_refunded` (`lib/ecommerce/admin-refund.ts:9-18`; RMA
  `app/[lang]/settings/rma/actions.ts:157-164`), and `amount_captured` is cash. A full refund of
  an order paid partly with points returns the cash and nothing more.
- **Partial returns are the gap.** An RMA refunds each returned line at its full `unit_price`
  (`lib/rma/refund.ts:6-11`). Returning one item of two therefore refunds that item's whole price
  in cash, including the part that points paid for. Slice 04 refunds the item's cash share only.

### 4. A return window and a release pattern already exist

Partner commissions are held until 30 days after delivery, dated from `orders.delivered_at`
(`lib/rma/eligibility.ts:7`; `lib/commissions/index.ts:28`; `lib/commissions/ledger.ts:126-160`).
Earned points follow the same window, so most refunds land before any points exist and there is
nothing to claw back.

### 5. A Result Order may have no Customer

Accept copies `customer_id` from the Result (`accept/route.ts:474`). That is null for a guest, an
assisted build and an in-store submit. Shop checkout always resolves a Customer with
`findOrCreateCustomer` (`lib/ecommerce/customers.ts:15`). Points need a Customer, so Accept does
the same.

### 6. The daily job and the email ledger exist

- **There is no room for another cron** (`vercel.json` holds two). The Aftercare runners chain
  onto `results-sla` (`lib/aftercare/job.ts`), and so will points.
- **Emails already go out exactly once.** `customer_emails` and `dispatchCustomerEmail` send each
  email once per (Customer, template, entity) (`lib/email/customer-emails.ts`).
- Expiry and its reminders are therefore one more runner and three more templates.

### 7. The voucher is off and does nothing

- **Nothing issues it.** The Claim issues nothing while `welcome_voucher_enabled` is not `'true'`.
- **Nothing promises it.** The wave sender refuses the announcement and the reminder until a
  sign-in would issue a voucher (`lib/customer-migration/wave-sender.ts:245-260`).
- It still appears in about fifteen places, listed in slices 05 and 06.

## Solution

> Keep an append-only points ledger for each Customer, read as a balance. When an Order's return
> window closes, write the points it earned on the cash the customer kept. Let a signed-in
> customer spend points as dollars off a shop order, reserved when Checkout opens. Give each
> Migrated customer a Claim bonus instead of the voucher, then retire the voucher.

### Rules (ADR 0030 records these)

**Value**

- **(a) 100 points = S$1.** It is fixed in code, not a setting, because changing it would
  devalue every balance.
- **(b) Points and dollars appear together** wherever a balance is shown:
  "2,130 points (S$21.30)".

**Earning**

- **(c) The earn formula.** An Order earns `floor(rate × base)` points.
  - `base = subtotal − discount_amount − amount_refunded`, floored at 0.
  - `subtotal` is goods and services. Shipping and tax sit outside it, and `discount_amount`
    includes any points spent, so the base is the cash paid for what was kept.
  - `rate` is the setting `points_earn_per_dollar`, default 3.
- **(d) When earned points arrive.**
  - They are pending until 30 days after `delivered_at`. An Order with only service lines
    waits 30 days after `paid_at` instead.
  - The daily job then writes one `earn` entry for that Order.
  - Pending points are not in the ledger. They are computed from paid Orders still inside
    their window.
- **(e) Which Orders earn.** Shop, Result and paid Re-adjustment Orders all earn. Orders paid
  before `points_launch_at` earn nothing.
- **(f) The Claim bonus.**
  - `claim_migrated_customer` grants `points_claim_bonus` points, once per Customer, while the
    bonus is set and today ≤ `points_claim_bonus_until`.
  - A Migrated customer who claimed earlier without one gets it at their next sign-in inside
    that window. This is what the voucher could never do.

**Spending**

- **(g) Who can spend.** Only a signed-in Customer checking out with their own account email.
  This is the bound-voucher rule (`mayUseBoundCoupon`, `lib/ecommerce/discounts.ts:46-55`).
  The Customer comes from the session through `getCurrentCustomerId`, never from the request.
- **(h) How much.**
  - In 100-point (S$1) steps, starting at `points_min_redeem` (500).
  - At most `points_max_share` (50%) of the products' price after any coupon.
  - Never shipping. Every Order still takes some cash.
- **(i) Reservation.**
  - Points are reserved when the Checkout is created, by one SQL function that locks the
    Customer and checks the balance.
  - They come back if the Checkout expires or its payment fails, and stay spent once it is paid.
- **(j) Where.** Shop orders only. Results, Re-adjustment fees and admin manual Orders take no
  points.

**Refunds and adjustments**

- **(k) Spent points are never refunded.** A refund returns cash only. A returned item refunds
  its cash share: its price less the points allocated to it at checkout.
- **(l) Clawback.** If a refund lands after the Order's points were written, the ledger takes
  back `floor(rate × refunded amount)`, no more than the Order earned and no more than the
  available balance. Any shortfall is recorded, not chased.
- **(m) Staff adjustments.** Staff may add or remove points with a written reason, for example
  to give points back when the shop cancels an order. This is the only manual path.

**Expiry**

- **(n) The 24-month clock.** The whole balance expires `points_expiry_months` (24) after the
  customer's last paid Order, or after their Claim bonus if that is later. A new purchase
  restarts the clock.
- **(o) Reminders.**
  - Emails go 3, 2 and 1 months before expiry, once each per clock, and only while the
    available balance is at least the minimum spend.
  - They state the balance and the date, and offer nothing else.
  - A Profile switch, `points_email`, turns them off.

**Storage**

- **(p) The ledger is append-only and server-only:** RLS on, no policy.
  - The balance is never stored on `customers`, because the customer can read their own row
    (ADR 0029 (d)).
  - Each entry carries its kind, its signed points, and the Order or refund it is about.
  - Staff entries also carry the Staff profile and the reason.

## The ledger

```sql
create table points_ledger (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  kind        text not null check (kind in
                ('earn', 'claim_bonus', 'spend', 'spend_release', 'clawback', 'expire', 'adjust')),
  points      integer not null check (points <> 0),   -- signed
  order_id    uuid null references orders(id) on delete set null,
  refund_id   text null,                              -- the Stripe refund a clawback answers
  note        text null check (length(note) <= 300),  -- required for 'adjust'
  created_by_profile_id uuid null references mp_staff(id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index points_ledger_one_per_order
  on points_ledger (order_id, kind)
  where order_id is not null and kind in ('earn', 'spend', 'spend_release');
create unique index points_ledger_one_claim_bonus
  on points_ledger (customer_id) where kind = 'claim_bonus';
create unique index points_ledger_one_per_refund
  on points_ledger (refund_id) where kind = 'clawback';
```

- **Signs.** `earn`, `claim_bonus` and `spend_release` are positive. `spend`, `clawback` and
  `expire` are negative. `adjust` can be either.
- **Balance.** The available balance is the sum of the entries, and it never goes below zero.
- **New columns elsewhere.**
  - `orders` gains `points_spent integer` and `points_discount numeric(10,2)`.
  - `order_items` gains `points_discount numeric(10,2)`, that line's share.

**Settings** live in `site_settings`, which is publicly readable. That is fine, because the
terms are advertised anyway:

| Key | Default |
|---|---|
| `points_enabled` | `false` |
| `points_launch_at` | unset |
| `points_earn_per_dollar` | `3` |
| `points_min_redeem` | `500` |
| `points_max_share` | `0.5` |
| `points_expiry_months` | `24` |
| `points_claim_bonus` | unset |
| `points_claim_bonus_until` | unset |

## User stories

1. As a customer, I earn 3 points for every S$1 I pay for products and services, so a pillow
   builds credit towards its accessories.
2. As a customer, I see points from a recent order as pending, with the date they become usable.
3. As a customer, I see my balance in dollars on my Profile, with its history and its expiry date.
4. As a customer, I can use points at shop checkout in S$1 steps, from S$5, up to half the
   products' price.
5. As a customer, I am told plainly, at checkout and in the terms, that points cannot be used on a
   custom pillow and are not refunded once used.
6. As a customer who bought as a guest, my points wait on my email, and I can use them once I sign
   in with it.
7. As a Shopify customer, claiming my account gives me a Claim bonus in points, even if I claimed
   before points launched.
8. As a customer, I get an email 3, 2 and 1 months before my points expire, and I can switch these
   off.
9. As a customer returning an item, I get back the cash I paid for it. The points I used on it are
   gone, as the terms said.
10. As Staff, I see a Customer's balance, pending points and history, and I can add or remove
    points with a written reason.
11. As the owner, I set the earn rate, minimum, cap, launch date, Claim bonus and its last date in
    the Admin Panel.
12. As the owner, I see what points cost at any moment: outstanding, pending, spent and expired.
13. As the owner, I know a balance can never be spent twice, even from two tabs at once.

## Non-goals

- **Spending points on custom pillows, Re-adjustment fees or admin manual Orders.** It needs its
  own PRD (audit §2).
- **Tiers, a rewards catalogue and birthday points.**
- **Points for reviews.** Google's policy forbids rewarding reviews, and so does the CRM
  (*Review request*).
- **Referral rewards.** They need their own PRD. Partner attribution (ADR 0015) already owns
  referral codes.
- **Cashing out, transferring, gifting or buying points.** Keeping them out keeps points a
  single-merchant loyalty scheme, outside MAS's e-money rules.
- **Any GST handling** (decision 6).
- **Anything on Shopify, including points for Shopify-era spend.** Unused Shopify gift vouchers
  (`info/GET-from-shopify.md:1036`) are settled at the migration's cutover (migration slice 10),
  not here.
- **WhatsApp or SMS points messages.**
- **Points for platform Orders paid before launch.**

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A balance spent twice from two tabs | Certain without a lock | (i): one SQL function holds a row lock on the Customer. The race is asserted in SQL, as migration slice 05's Claim race is |
| Points come back as cash on a partial return | Certain today (audit §3) | (k): refund the line's cash share; a vitest table covers it |
| A reservation left behind by a Checkout that was never created | Possible on a Stripe error | The route releases on error. The daily job releases reservations whose Order is cancelled, failed, or still pending past Stripe's 24-hour session life |
| Historic Orders earn points at launch | Certain without a date | (e): `points_launch_at` |
| Terms read as misleading (custom pillows excluded, spent points not refunded) | Moderate | The terms page states every rule, checkout repeats the two exclusions beside the control, and counsel reviews them (slice 08) |
| Reminder emails treated as marketing | For counsel | Their own opt-out and no offer in the copy. Gating them on **Marketing consent** instead is one condition (slice 07) |
| The amount owed in points grows unseen | Certain without reporting | A Settings card shows outstanding, pending, spent and expired points. The accountant decides the treatment (slice 08) |
| The bonus is promised before it can be spent | Certain if slice 05 ships before 04 | The wave sender's preflight requires spending to be live |

## Success criteria

- Every Order paid after launch earns exactly `floor(rate × base)` points, once, when its window
  closes.
- No balance ever goes below zero through spending, and no points are spent twice.
- No refund pays out more cash than the customer paid for the items returned.
- Every Migrated customer who claims within the bonus window holds exactly one Claim bonus.
- Staff can explain any balance from its ledger entries.
- No Welcome-back voucher code remains after slice 06.

## Open decisions for the owner

1. **Claim bonus size and last date.** I suggest 2,000 points (S$20), granted until a date after
   the last migration wave.
2. **Launch date** (`points_launch_at`). Orders paid before it earn nothing.
3. **Partner commission on an order paid partly with points.** I recommend leaving it unchanged:
   paid on the full price, as with coupons today (webhook `route.ts:282-295`).
4. **Partial returns.** Refund the returned item's cash share (the default above), or refund cash
   first and treat the points as spent on what was kept? The second needs no change to RMA, but
   lets a customer end up holding an item paid for wholly in points.
5. **Reminder emails.** Send them as an account notice with their own switch (the default
   above), or only to customers with Marketing consent? This is for counsel.
6. **The voucher code.** Retire it in slice 06 (recommended), or keep it dormant?
