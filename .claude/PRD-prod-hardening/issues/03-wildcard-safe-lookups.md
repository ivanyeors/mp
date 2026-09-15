# 03: Wildcard-safe lookups: exact coupon match, escaped email match, Staff record ownership

**Type:** AFK
**Blocked by:** none
**User stories:** 5, 6, 7
**Labels:** `bug`, `needs-triage`, `P0`, `area:checkout`, `area:admin`

## Goal

No lookup that decides money or privilege may treat `%` or `_` from the user as a wildcard.

## The gap, precisely

**Coupons.** `lib/ecommerce/discounts.ts:171-177`:
```ts
const normalized = code.toUpperCase().trim();
… .eq("is_active", true).ilike("code", normalized).single();
```
- `%` matches every coupon. `.single()` then succeeds whenever exactly one active coupon matches, and a prefix like `STAFF%` or `%100%` narrows it to one.
- The full coupon row is returned to anonymous callers by:
  - `app/api/shop/coupons/validate/route.ts:86-90` (`coupon: result.coupon`)
  - the public server action `app/[lang]/shop/checkout/actions.ts:16,28`
- Checkout then accepts the same pattern (`app/api/shop/checkout/route.ts:~394`) and stores the real code.
- There are 0 active coupons in prod on 2026-09-15, so no live exposure yet.

**Emails (unescaped `ilike`)**
- `lib/auth/admin.ts:66-75`, the `getAdminContext` email fallback. It finds an `admin_users` row by `ilike("email", email)` and grants its role **even when `row.auth_user_id` is already bound to a different auth user**.
- `lib/ecommerce/customers.ts:12`
- `app/api/shop/checkout/route.ts:~374`: a guest checkout with a wildcard email can attach the Order to another Customer.
- `lib/ecommerce/discounts.ts:~155`: per-customer coupon use count.

**The fix already exists:** `escapeLikePattern` in `lib/auth/customer-identity.ts:26`, which `lib/auth/partner.ts` already uses.

## Scope

- **Coupon lookup:** exact match on the normalised code. Coupon codes are stored upper-case; confirm first, and if they aren't, use `escapeLikePattern` plus `ilike`.
- **Both public validators** return only `{ valid, discount_amount, free_shipping, error }`, never the row. Update the checkout UI consumer if it reads other fields.
- **The 4 email lookups:** `escapeLikePattern` (or `.eq` on a lower-cased column where the column is already normalised).
- **`getAdminContext`:** when the email fallback finds a row with a non-null `auth_user_id` different from the current user's id, return null.
  - Bind `auth_user_id` only when it is null (the existing first-sign-in bind).
  - The bootstrap allowlist path is unchanged.

## Acceptance criteria

- [ ] vitest: `validateCoupon("%")`, `validateCoupon("_")` and `validateCoupon("STAFF%")` return `valid: false` with a seeded active coupon `STAFF10`, and `validateCoupon("staff10")` is valid. These fail on today's code.
- [ ] vitest: the validate route response has no `coupon` key.
- [ ] vitest: `getAdminContext` returns null for user B when `admin_users` holds a row for B's email that is already bound to user A.
- [ ] vitest: a checkout customer lookup with `a_b@x.com` doesn't match `axb@x.com`.
- [ ] The storefront coupon apply flow still shows the discount (check manually on preview).
