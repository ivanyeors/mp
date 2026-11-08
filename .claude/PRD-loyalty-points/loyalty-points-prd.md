# PRD — Loyalty points

**Status:** being built on `claude/admiring-ride-40h2o6` (slices 01 and 02 built, 2026-10-21)
**Builds on:** `PRD-shopify-customer-migration` and `PRD-customer-crm`, both on
`claude/shopify-migration-plan-izv7fo` @ `c6155da3`. Every line reference below is to that
branch. Start building once it merges.
**ADR:** `docs/adr/0030-loyalty-points.md`, written by slice 01 (0028 went to the CRM and 0029 to
the migration; take the next free number if either moves).
**Owner decisions:** taken on 2026-10-21, plus bonus milestones on 2026-10-23, all listed below.
On 2026-10-31 the owner retired expiry: points never expire, and decisions 8 and 9 and rules (o)
and (p) no longer apply (ADR 0030, amendment of 2026-10-31). Nothing is open for the owner. Counsel and the accountant have questions in slice 08.

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

**The programme**

1. **Points are a dollar offset and nothing else.** 100 points = S$1, spent as money off a
   purchase. There are no tiers, no rewards catalogue, and no cashing out, transferring or buying
   points.
2. **Points are earned on purchases, plus a one-time Claim bonus** for Migrated customers.
3. **The earn rate is 3 points per S$1 (3%).** Lowered to 1 point per S$1 (1%) by the owner on
   2026-11-08 (ADR 0030 amendment); 100 points = S$1 is unchanged.
4. **Points are spent on shop orders only.** Custom pillows (**Results**) earn points but cannot
   take them.
5. **GST does not count.** Points are earned on, and taken off, the price before GST. Mellow Life
   is not GST-registered (`20260630130000_disable_gst_until_registered.sql:4-6`).
6. **Only Orders paid from the launch day earn.** Past platform Orders earn nothing.

**Refunds**

7. **Points used to buy products are never refunded,** and a partial return treats them as spent
   on what the customer kept. A refund is cash only, up to the cash paid on the Order.

**Expiry** (retired 2026-10-31: points never expire)

8. ~~**Points expire 24 months after the customer's last purchase,** with reminder emails 3, 2 and
   1 months before.~~ Retired: points never expire.
9. ~~**Reminders go only to customers who agreed to marketing email,** as the check-up reminder
   does (CRM slice 08).~~ Retired with decision 8: there are no expiry reminders.

**The Claim bonus**

10. **The Claim bonus is 1,000 points (S$10).**
11. **It has no calendar end date. It has a 3-month window instead:**
    - for a customer we emailed, 3 months from their first campaign email;
    - for one we never emailed, 3 months from the first wave.

**Partners**

12. **Partners neither earn nor spend points.** Their reward is the partner milestone tiers.
13. **Partner commission is unchanged.** It is paid on the full price when a referred customer
    uses points, as it is today when they use a coupon.

**Vouchers, and Shopify**

14. **The voucher feature is deleted.** Any future code-based incentive uses the existing Discounts
    feature as it is, with no account-bound variant.
15. **Nothing is built for Shopify** (CLAUDE.md, *Shopify is being replaced*). Points exist on
    this platform only.

**Bonus milestones (2026-10-23)**

16. **Customers get a one-time bonus as the points they earn from orders add up,** on a ladder
    the owner sets. The Profile shows it as a progress bar with the milestones on it. A milestone
    is not a tier: nothing about earning or spending changes after it (slice 09).

## What the code already does, before designing anything

### 1. Shop checkout already folds several discounts into one

- **Discounts already add up into one figure.** Partner self-purchase pricing is added to the
  coupon's discount and goes to Stripe as one `amount_off` coupon, labelled
  "CODE + Partner pricing" (`app/api/shop/checkout/route.ts:613-641`;
  `lib/stripe/checkout.ts:187-195`). Points join the same sum. Tax (`lib/ecommerce/tax.ts:103-114`)
  and the paid-time reconcile (`lib/stripe/reconcile.ts:71-83`) then agree without change.
- **The Order does not record where its discount came from.** It keeps one `discount_amount`
  (`0028_ecommerce.sql:395-401`).
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

### 3. Refunds already follow decision 7, so they don't change

- **Every refund path pays out cash only.** Each caps at `amount_captured − amount_refunded`
  (`lib/ecommerce/admin-refund.ts:9-18`; RMA `app/[lang]/settings/rma/actions.ts:157-164`), and
  `amount_captured` is cash.
- **A return refunds cash first.** An RMA refunds each returned line at its `unit_price`
  (`lib/rma/refund.ts:6-11`), up to the cash still unrefunded.
- **So points end up spent on what was kept.** A full refund returns the cash paid and nothing
  more. A partial return refunds the item's price in cash until the Order's cash runs out.

There is a cost the owner accepts: a customer who returns part of an Order can end up holding an
item paid for wholly in points, above the 50% cap.

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

### 6. Partners are recognised by their login or email, and their own purchases are marked

- **Matching.** `loadPartnerRow` matches a signed-in user to `partner_users` by `auth_user_id`,
  then by email (`lib/auth/partner.ts:41-63`).
- **Marking.** Checkout gives an active partner self-purchase pricing and stamps
  `self_purchase_partner_id` on the Order (`route.ts:605-641`).
- **Points use both.** The same match keeps partners from earning or spending, and
  `self_purchase_partner_id` keeps their Orders from earning.

### 7. The daily job and the email ledger exist

- **There is no room for another cron** (`vercel.json` holds two). The Aftercare runners chain
  onto `results-sla` (`lib/aftercare/job.ts`), and so will points.
- **Emails already go out exactly once.** `customer_emails` and `dispatchCustomerEmail` send each
  email once per (Customer, template, entity) (`lib/email/customer-emails.ts`).
- **There is a consent-gated reminder to copy.** The check-up reminder sends only to
  `marketing_email = 'subscribed'` (`lib/aftercare/checkup-server.ts:250-258`). The expiry
  reminders follow it.

### 8. The campaign records when each customer was first emailed

`customer_campaign_sends` (migration slice 08) holds a sent row per Customer and template, so
both clocks in decision 11 (a customer's first email, and the first wave) are facts already
stored.

### 9. The voucher is off and does nothing

- **Nothing issues it.** The Claim issues nothing while `welcome_voucher_enabled` is not `'true'`.
- **Nothing promises it.** The wave sender refuses the announcement and the reminder until a
  sign-in would issue a voucher (`lib/customer-migration/wave-sender.ts:245-260`).
- It still appears in about fifteen places, listed in slices 05 and 06.

## Solution

> Keep an append-only points ledger for each Customer, read as a balance. When an Order's return
> window closes, write the points it earned on the cash the customer kept. Let a signed-in
> customer who is not a partner spend points as dollars off a shop order, reserved when Checkout
> opens. Give each Migrated customer who claims within their window a Claim bonus, then delete
> the voucher.

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
- **(e) Which Orders earn.** Shop, Result and paid Re-adjustment Orders all earn, if they were
  paid on or after `points_launch_at`. These never earn:
  - an Order with `self_purchase_partner_id`;
  - an Order whose Customer is a partner (rule r).

**The Claim bonus**

- **(f) The grant.** `claim_migrated_customer` grants `points_claim_bonus` (1,000) points, once
  per Customer, if the Customer claimed inside their window. Their window ends
  `points_claim_bonus_months` (3) after:
  - their first sent campaign email, or, if we never emailed them,
  - the first campaign email sent to anyone.
- **(g) Late grants.** A customer who claimed before points launched is granted the bonus at
  their next sign-in, as long as the Claim fell inside the window. Before any wave has gone out,
  every window is still open.

**Spending**

- **(h) Who can spend.** Only a signed-in Customer who is not a partner, checking out with their
  own account email.
  - This is the account-binding rule `mayUseBoundCoupon` (`lib/ecommerce/discounts.ts:46-55`).
    It moves to `lib/points/` as `mayUseAccountValue` when slice 06 deletes the voucher.
  - The Customer comes from the session through `getCurrentCustomerId`, never from the request.
- **(i) How much.**
  - In 100-point (S$1) steps, starting at `points_min_redeem` (500).
  - At most `points_max_share` (50%) of the products' price after any coupon.
  - Never shipping. Every Order still takes some cash.
- **(j) Reservation.**
  - Points are reserved when the Checkout is created, by one SQL function that locks the
    Customer and checks the balance.
  - They come back if the Checkout expires or its payment fails, and stay spent once it is paid.
- **(k) Where.** Shop orders only. Results, Re-adjustment fees and admin manual Orders take no
  points.

**Refunds and adjustments**

- **(l) Spent points are never refunded.** A refund is cash only, up to the cash paid. A partial
  return refunds cash first, so the points stay spent on what was kept. Refund code does not
  change.
- **(m) Clawback.** If a refund lands after the Order's points were written, the ledger takes
  back `floor(rate × refunded amount)`, no more than the Order earned and no more than the
  available balance. Any shortfall is recorded, not chased.
- **(n) Staff adjustments.** Staff may add or remove points with a written reason, for example
  to give points back when the shop cancels an order. This is the only manual path, and it is
  refused for a partner.

**Expiry** (retired 2026-10-31; `20261031032017_points_never_expire.sql` removed all of it)

- **(o) The 24-month clock.** The whole balance expires `points_expiry_months` (24) after the
  customer's last paid Order, or after their Claim bonus if that is later. A new purchase
  restarts the clock.
- **(p) Reminders.**
  - Emails go 3, 2 and 1 months before expiry, once each per clock, and only while the
    available balance is at least the minimum spend.
  - They go only to `marketing_email = 'subscribed'`, through the same gate and ledger as the
    check-up reminder.
  - Unsubscribing from marketing stops them. There is no separate switch.

**Storage and partners**

- **(q) The ledger is append-only and server-only:** RLS on, no policy.
  - The balance is never stored on `customers`, because the customer can read their own row
    (ADR 0029 (d)).
  - Each entry carries its kind, its signed points, and the Order or refund it is about.
  - Staff entries also carry the Staff profile and the reason.
**Bonus milestones (slice 09)**

- **(s) The ladder.** Up to five milestones, each a number of points earned and a bonus, both in
  multiples of 100 and climbing. It is one setting, `points_milestones` ("1000:100,2500:300").
  Missing, blank or malformed means no milestones, never a default.
- **(t) What counts.** Points earned from orders: every `earn` less every `clawback`. Spending
  and expiry don't set the bar back. The Claim bonus, Staff adjustments and milestone bonuses
  don't move it.
- **(u) How many.** One `milestone_bonus` per milestone reached, numbered from 1, never more, so
  changing the ladder never pays a milestone twice. A new or lowered milestone is granted on the
  next daily run to everyone already past it.
- **(v) Never taken back.** A refund that takes a customer below a milestone leaves its bonus.
- **(w) When.** The daily job grants them right after it releases earned points, only while
  points are live, never to a partner.

- **(r) Who counts as a partner.** A Customer is a partner when `partner_users` holds their login
  or their email, matched as `loadPartnerRow` matches (`lib/auth/partner.ts:41-63`), and that
  partner is approved. They hold no points:
  - nothing is earned;
  - the checkout control never shows;
  - the Claim bonus is not granted;
  - Staff cannot adjust their balance.

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
- **New columns.** `orders` gains `points_spent integer` and `points_discount numeric(10,2)`.
  Lines carry no points share, because refunds don't need one (decision 7).

**Settings** live in `site_settings`, which is publicly readable. That is fine, because the
terms are advertised anyway:

| Key | Default |
|---|---|
| `points_enabled` | `false` |
| `points_launch_at` | unset |
| `points_earn_per_dollar` | `3` |
| `points_min_redeem` | `500` |
| `points_max_share` | `0.5` |
| ~~`points_expiry_months`~~ | removed 2026-10-31 |
| `points_claim_bonus` | `1000` |
| `points_claim_bonus_months` | `3` |
| `points_milestones` | `1000:100,2500:300,5000:800,10000:2000` (slice 09) |

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
7. As a Shopify customer, claiming my account within 3 months of our email gives me S$10 in
   points, even if I claimed before points launched.
8. As a customer who agreed to marketing email, I get an email 3, 2 and 1 months before my points
   expire.
9. As a customer returning part of an order, I get my cash back up to what I paid. The points I
   used stay spent, as the terms said.
10. As Staff, I see a Customer's balance, pending points and history, and I can add or remove
    points with a written reason.
11. As the owner, I set the earn rate, minimum, cap, launch date, Claim bonus and its window in
    the Admin Panel.
12. As the owner, I see what points cost at any moment: outstanding, pending, spent and expired.
13. As the owner, I know a balance can never be spent twice, even from two tabs at once.
14. As a partner, my purchases neither earn nor spend points. My rewards are the partner tiers.
15. As a customer, I see on my Profile how far I am to my next bonus milestone, and what it adds.
16. As the owner, I set the milestones and their bonuses, and see what they cost.

## Non-goals

- **Spending points on custom pillows, Re-adjustment fees or admin manual Orders.** It needs its
  own PRD (audit §2).
- **Tiers, a rewards catalogue and birthday points.** Partners keep their own milestone tiers.
  Bonus milestones (slice 09) are not tiers: each pays a one-time bonus and changes nothing else.
- **Points for reviews.** Google's policy forbids rewarding reviews, and so does the CRM
  (*Review request*).
- **Referral rewards.** They need their own PRD. Partner attribution (ADR 0015) already owns
  referral codes.
- **Cashing out, transferring, gifting or buying points.** Keeping them out keeps points a
  single-merchant loyalty scheme, outside MAS's e-money rules.
- **Account-bound vouchers of any kind.** A code-based incentive uses the Discounts feature as it
  is (decision 14).
- **An email tool in Settings for writing to customers.** The owner wants one. It belongs to
  `PRD-email-marketing`, whose placeholder already scopes a Campaigns page: pick a template and a
  **Segment**, see who is eligible after consent, test, then send.
- **Any GST handling** (decision 5).
- **Anything on Shopify, including points for Shopify-era spend.** Unused Shopify gift vouchers
  (`info/GET-from-shopify.md:1036`) are settled at the migration's cutover (migration slice 10),
  not here.
- **WhatsApp or SMS points messages.**

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A balance spent twice from two tabs | Certain without a lock | (j): one SQL function holds a row lock on the Customer. The race is asserted in SQL, as migration slice 05's Claim race is |
| A partial return leaves an item paid wholly in points, above the 50% cap | Possible | Accepted (decision 7). The terms say a return refunds cash up to what was paid |
| A reservation left behind by a Checkout that was never created | Possible on a Stripe error | The route releases on error. The daily job releases reservations whose Order is cancelled, failed, or still pending past Stripe's 24-hour session life |
| A partner earns or spends by buying as a guest under another email | Possible | Accepted. Only the matches in (r) are checked. Staff can remove points with a reason |
| Terms read as misleading (custom pillows excluded, spent points not refunded) | Moderate | The terms page states every rule, checkout repeats the two exclusions beside the control, and counsel reviews them (slice 08) |
| The amount owed in points grows unseen | Certain without reporting | A Settings card shows outstanding, pending, spent and expired points. The accountant decides the treatment (slice 08) |
| The bonus is promised before it can be spent | Certain if slice 05 ships before 04 | The wave sender's preflight requires spending to be live |

## Success criteria

- Every non-partner Order paid after launch earns exactly `floor(rate × base)` points, once,
  when its window closes.
- No balance ever goes below zero through spending, and no points are spent twice.
- No refund pays out more cash than the customer paid.
- Every Migrated customer who claims within their window holds exactly one Claim bonus, and no
  partner holds one.
- Staff can explain any balance from its ledger entries.
- No Welcome-back voucher code remains after slice 06.
