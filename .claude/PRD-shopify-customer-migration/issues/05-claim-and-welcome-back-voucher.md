# 05 — Claim on first sign-in, and an account-bound welcome-back voucher

**Type:** AFK
**Blocked by:** 02; owner decision 2 for the default terms
**User stories:** 2, 3, 7
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:checkout`, `area:admin`

## Goal

The moment a Migrated customer signs in, they are claimed and hold exactly one voucher that
nobody else can use. No new page is needed for this. It works for someone who never opens the
campaign email.

## Schema

```sql
alter table coupons
  add column customer_id uuid null references customers(id) on delete cascade,
  add column issued_for  text null check (issued_for in ('welcome_back'));
create unique index coupons_one_per_customer_purpose
  on coupons (customer_id, issued_for)
  where customer_id is not null and issued_for is not null;
```

The voucher terms are `site_settings` keys, read server-side only. The editing UI is in
slice 06.

- `welcome_voucher_enabled`
- `welcome_voucher_type` (`fixed_amount` | `free_shipping`)
- `welcome_voucher_value`
- `welcome_voucher_min_order`
- `welcome_voucher_valid_days` (default 60)
- `welcome_voucher_issue_until` (date)

## Claim

`claim_migrated_customer(customer_id uuid)` is a SECURITY DEFINER SQL function, `service_role`
only, and runs as one transaction:

1. `update migrated_customers set claimed_at = now() where customer_id = $1 and claimed_at is null returning …`.
   If no row comes back, stop: either this is not a Migrated customer, or the Claim already
   happened.
2. If the settings are enabled and today ≤ `issue_until`, insert the voucher:
   - code: `WB-` plus 10 characters of server-side `gen_random_bytes`, base32 without
     look-alike characters;
   - `usage_limit = 1`, `per_customer_limit = 1`, `expires_at = now() + valid_days`;
   - `customer_id`, `issued_for = 'welcome_back'`;
   - `on conflict do nothing`.
3. Return whether a voucher was issued.

Call it from `linkCustomerToAuthUser` (`lib/auth/customer-identity.ts:67`) after the link,
**for every decision type**, including `already_linked`. That covers three cases:

- someone who signed in before this slice shipped;
- a Customer who already had an account when their Shopify row merged into it;
- anyone else who claims through a later sign-in.

After the first call the update matches nothing, so the cost on later calls is one indexed no-op
update. Then send the `welcome_voucher` email **once**, through a ledger in the style of
`order_emails`. This is transactional: it confirms something the customer just did, so consent is
not required.

## Voucher validation

`validateCoupon` gains `sessionCustomerId`. When `coupon.customer_id` is set, the coupon is valid
only if **both** of these hold:

- `sessionCustomerId === coupon.customer_id`;
- the checkout email resolves to that same Customer.

This keeps the **Order**, the per-customer count and the voucher on one row. Otherwise it fails
with *"This voucher belongs to an account. Sign in with the email it was sent to."*

There are three call sites, and each resolves the session Customer from
`createSupabaseServerClient()` → `getUser()` → `customers.auth_user_id`. Never trust an id from
the request body.

- `app/api/shop/checkout/route.ts:512` (authoritative)
- `app/api/shop/coupons/validate/route.ts` (preview)
- `app/[lang]/shop/checkout/actions.ts:16` (server action)

A coupon with `customer_id` null behaves exactly as today. This slice must not change one line of
the bearer-code path.

## Acceptance criteria

- [ ] Two concurrent `claim_migrated_customer` calls for one Customer result in one `claimed_at`
      and one voucher. Covered by a SQL assert, not a mock.
- [ ] A non-migrated Customer signing in gets no voucher, and makes no write beyond today's.
- [ ] After `welcome_voucher_issue_until`, a Claim stamps `claimed_at` and issues nothing.
- [ ] Checkout with a bound voucher is refused for: a guest, a different signed-in Customer, and
      the owner checking out under a different email. It is accepted for the owner using their
      own email.
- [ ] Every existing coupon test passes unchanged. A new vitest table covers the bound-coupon
      branch of `validateCoupon`.
- [ ] A Shopify customer booking a re-adjustment still sees "not listed" at the fee, unchanged
      (PRD user story 7).
- [ ] `./scripts/graphify update .` is run in the same commit.
