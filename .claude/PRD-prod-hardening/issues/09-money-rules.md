# 09: Money rules that can't be typed around: tax country, self-referral, Add-on quantity, coupon cap

**Type:** AFK
**Blocked by:** 03 (#169) (coupon lookup), 04 (#170) (checkout pricing). Both touch the same checkout code.
**User stories:** 24, 25, 26, 27
**Labels:** `bug`, `needs-triage`, `P1`, `area:checkout`, `area:tax`

## Goal

Four places where a client-typed value changes what the business earns. Close each at the server.

## The gap, precisely

**1. GST avoidance**
- `shipping_address.country` is a free string (`app/api/shop/checkout/route.ts:46`) and is never checked against the chosen shipping method's `countries`. `ShippingMethod.countries` is only used in the admin UI.
- The only tax rule seeded is `SG` (`supabase/migrations/0036_tax_rates.sql:44-46`) and there is no `*` fallback. So `resolveTaxRule` (`lib/ecommerce/tax.ts:155`) returns null and tax is 0 while SG delivery is still used (`checkout:475-476`).
- The same applies in `app/api/results/hold/route.ts:~505`. With Stripe Tax on, the fake country is passed to Stripe.

**2. Self-referral** (breaks ADR 0015 §4)
- `checkout/route.ts:426-428` resolves `referral_code` with no check against the signed-in Partner. `:441` skips the self-purchase branch whenever a code resolves, and `:501` saves `partner_id`.
- `results/hold/route.ts:611-641` accepts any `partnerAssistCode` or `referralCode`. `accept/route.ts:375-398` then creates the commission and runs `applyMilestoneProgress`.
- `lib/milestones/ledger.ts:152-191` only ratchets up. A refund voids commissions but keeps the milestone bonus and the rate bump. (Reversal is out of scope; see the PRD.)

**3. Fractional Add-on quantity**
- `lib/results/finish-schemas.ts:11,17` has `quantity: z.number().positive()`, with no integer rule and no cap.
- `composed-price.ts:~168` multiplies `msrp * quantity`, so a quantity of 0.01 costs 1%.

**4. Coupon usage cap**
- The cap is checked at checkout (`lib/ecommerce/discounts.ts:193`), but usage is only incremented after payment.
- `increment_coupon_usage` (`supabase/migrations/20260702130000_increment_coupon_usage.sql`) doesn't cap, so parallel sessions all pass.

## Scope

- **Tax country:**
  - Load the selected shipping method and require the uppercase `shipping_address.country` to be in `countries`; otherwise return 400 `field: "country"`.
  - Apply the same check in results hold.
  - If a method has an empty `countries`, treat it as SG-only (confirm with the seeded data).
- **Self-referral.** Ignore the referral or assist code (don't error) when it resolves to:
  - the signed-in Partner account's partner, or
  - a Partner whose login email or backup email equals the buyer email (escaped exact match, from slice 03).

  Attribution then falls through to the existing self-purchase rules. Apply in both checkout and hold.
- **Add-on quantity:** `z.number().int().min(1).max(20)`. Use a shared constant if one exists for Add-on caps.
- **Coupon cap migration:** `increment_coupon_usage` becomes
  ```sql
  update coupons set usage_count = usage_count + 1
  where id = $1 and (usage_limit is null or usage_count < usage_limit)
  returning usage_count
  ```
  - It returns whether it applied, and has `set search_path = public`.
  - The webhook records an Order timeline note when the increment didn't apply (the limit was already reached by a parallel checkout). It doesn't block payment that has already happened.
  - Apply with `supabase db push`.

## Acceptance criteria

- [ ] vitest: checkout with an SG shipping method and `country: "US"` returns 400. Fails on today's code.
- [ ] vitest: hold with the same mismatch returns 400.
- [ ] vitest: a signed-in Partner checking out with their own referral code produces an Order with no `partner_id` attribution from that code.
- [ ] vitest: `FinishSchema` rejects quantity `0.5` and `21`, and accepts `2`.
- [ ] vitest (or an SQL test through the Supabase test harness if one exists): two increments against `usage_limit = 1` give `usage_count = 1`.
- [ ] Migration applied to prod in the same sitting as the merge. `get_advisors` shows no new warning.
