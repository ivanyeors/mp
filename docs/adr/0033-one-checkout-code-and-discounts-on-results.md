# One checkout code field, and discount codes on customisations

Status: Accepted (2026-10-24)

## Context

Shop checkout had two code inputs in two places: a coupon field in the cart and an optional
"Partner / referral code" at checkout. The customisation contact step (mp-config, mbolster-config)
had only the referral field, and a Result had no discount at all: the hold, assign, Accept and
every repricing priced it with `discountAmount: 0`. A shopper with a discount code had nowhere to
type it on the one path that sells Mpillow and Mbolster, and typing it into the referral field
read "Code not recognised".

Both inputs were checked by public, anonymous, unthrottled endpoints
(`/api/shop/coupons/validate`, `/api/partner/referral/validate`), and a coupon's usage limit counted
paid Orders only, so a Result could hold a limited code that nothing counted until Accept, days
later.

## Decision

- **One field.** Shop checkout and the customisation contact step show one optional "Discount or
  referral code". The cart's code field takes either kind as well, and checkout starts from it.
  An order carries one code.
- **The server says what a code is.** `resolveCheckoutCode` (`lib/checkout-code`): a code an
  active partner holds is a referral code; otherwise one an active coupon has is a discount code;
  otherwise it is unknown. A coupon may not be saved under a code any partner holds, and a new
  referral code skips any coupon's, so the order only matters for older rows.
- **What the field says.** A referral code reads "Referral code active — referred by …" and
  changes no price. A discount code reads "Discount code active — S$X off" (or "free shipping"),
  and the page's total takes it off as soon as the check returns. A code nobody recognises, or a
  discount code that cannot be used on this order, says so and never blocks moving on.
- **Prices are the server's.** `POST /api/checkout/code` is a preview from the totals the page
  sends. Shop checkout and the hold resolve the code again and price the order from the
  database; only that is charged. A discount code that was accepted on the page but cannot be
  used by the time the order is placed (its limit filled in between) is refused with its reason,
  before any Checkout exists; an unknown code is simply not applied.
- **Guessing is metered.** The check endpoint, shop checkout and the hold draw on one allowance
  per IP (60 code lookups in ten minutes, `checkoutCodeRateLimited`). The two old public
  validators are gone. Neither answer carries the coupon row or the partner's id.
- **A discount code on a Result is checked once, at hold, and kept as terms.** The hold checks
  the coupon as shop checkout does — active, in date, under its limits, over its minimum, in
  scope — on the build's goods. The Result keeps `coupon_id`, `coupon_code` and `coupon_terms`
  (`{discount_type, discount_value, max_discount}`). Every repricing (assign, the status page,
  request-payment, finish, reconfigure, Accept) takes those terms off the goods it prices then
  (`resultCouponPricing`). So the discount follows the build Staff assign, a change to the
  coupon in Settings never moves a price already authorised, and expiry after the hold does not
  take the discount back.
- **Off the goods only.** The discount comes off the build, preferences and add-ons, never off
  Service fees, shipping or tax; tax is due on what is left. A free-shipping code zeroes the
  Result's own shipping. `free_above` is still judged on goods before the discount, as in shop
  checkout.
- **Scope maps a build to its storefront product.** A coupon limited to products or categories
  applies to a customisation through the storefront product its Composed sellable is listed as
  (`resultCouponLineItems`). A coupon scoped to the Mpillow product therefore works on an Mpillow
  customisation, the only way to buy one.
- **A Paired build's code is on the Mpillow.** The anchor carries it, where shipping is charged;
  the Mbolster carries none. The minimum and scope are judged on the Mpillow's goods.
- **A held Result holds a use.** A coupon's usage and per-customer limits count paid Orders plus
  live Results carrying it (held, assigned or accepted, no Order yet) that entered the money
  path: a card authorised, or no card taken at all. An abandoned Checkout holds nothing. At
  Accept the Order gets `coupon_id`, `coupon_code` and `discount_amount`, and the coupon's
  `usage_count` goes up once — after which the Result no longer counts as live.
- **A reorder does not carry the code.** Its limits were checked for the old sale.

## Consequences

- **Apply the migration before the code.** Every hold and repricing selects or writes the three
  columns, so against the old schema they fail. The columns on their own change nothing. The
  migration also revokes the API roles' leftover grants on `coupons` and on
  `increment_coupon_usage`.
- An Assisted customisation's questionnaire has no price yet: the field checks the code as a
  code (kind, dates, limits) and the amount appears once the build is priced. Its finish page and
  a Staff re-configure show the code the Result already carries.
- Points are earned on `subtotal − discount_amount`, so a discounted Result's Order earns on
  what was paid. Commission stays on the composed sellable's base price, as before; a discount
  code does not reduce it.
- The per-IP limiter is per instance (`lib/rate-limit.ts`): it slows a guesser, it does not stop a
  distributed one. A code worth protecting should carry a usage limit.
- Two Results held at the same moment can both pass a limit with one use left; the count is a
  read, not a reservation. The window is the seconds between check and write, not the days
  between hold and Accept it used to be.

## Amendment (2026-10-25): per-customer limits are per account

Counted by the email typed at checkout, a "once per customer" code was reusable by anyone with a
second email address. Pre-launch hardening changed what the limit means:

- **Blank means no limit.** `per_customer_limit` null is a code open to guests, counted only
  against `usage_limit`. The Settings → Discounts field is one number input; blank (or 0) saves
  null, and new codes start blank. Before this, the editor could not express "no limit", so codes
  were saved with 1 or 99.
- **A number needs the account.** A code with a per-customer limit is usable only by a signed-in
  Customer checking out under their own account email, the same rule points use (ADR 0030 (h)).
  Otherwise it is refused with "Sign in with your account email to use this code". Uses are
  counted per account: paid and still-open orders by the Customer or by the account's email, and
  live Results by that email.
- **Bound vouchers are enforced.** A coupon with `customer_id` (a Welcome-back voucher, ADR 0029)
  works only for that Customer, signed in under their own email. To anyone else it reads "This
  code isn't valid", like a code that does not exist. The 20261020112100 migration described this
  check, but nothing performed it.
- **Open checkouts hold a use.** A pending, unpaid order younger than a Checkout Session counts
  against both limits. Shop Checkout Sessions now expire after one hour, not Stripe's default 24
  (`lib/stripe/checkout-lifetime.ts`), so an abandoned checkout gives its use back within the
  hour, and `usage_count` is incremented with a cap
  (`increment_coupon_usage_capped`); an order that still lands past the limit is flagged
  `needs_attention`. This replaces the "count is a read, not a reservation" consequence above.
- **Referral codes are unchanged:** one per order, never stacked with a typed discount code, and
  never credited to the buyer's own partner account.
