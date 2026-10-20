# 05 — Claim on first sign-in, and an account-bound welcome-back voucher

**Issue:** [#269](https://github.com/ivanyeors/mp/issues/269) (parent #264)
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

The voucher terms are `site_settings` keys. `site_settings` is publicly readable
(`20260308000000_create_site_settings.sql:11`), which is fine for terms that are advertised
anyway. The server reads them at issuance and never trusts a copy from the client. The editing UI
is in slice 06.

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
update. Then send the `welcome_voucher` email **once**. This is transactional: it confirms
something the customer just did, so consent is not required.

- **Its ledger is a new table, `customer_emails`.** `order_emails` cannot hold it: it is keyed
  by `order_id` (`0035_order_emails.sql`), and a Claim has no Order. The CRM's aftercare emails
  use the same table (CRM 07, 08), so whichever slice lands first creates it:

  ```sql
  create table customer_emails (
    id          bigserial primary key,
    customer_id uuid not null references customers(id) on delete cascade,
    template    text not null,                 -- registry name, e.g. 'welcome_voucher'
    entity_id   uuid not null,                 -- what it is about: the Customer, an Order…
    status      text not null check (status in ('pending', 'sent', 'failed')),
    attempts    int not null default 1,
    last_error  text null,
    sent_at     timestamptz null,
    created_at  timestamptz not null default now(),
    unique (customer_id, template, entity_id)
  );
  ```

  - The row is claimed as `pending` before sending, then marked `sent` or `failed`.
  - **A failed send is retried,** unlike `order_emails`, whose failed rows are final
    (`dispatchOrderEmail` claims with `ignoreDuplicates`). A later call re-claims a `failed` row
    with a conditional update (`status = 'failed' and attempts < 3`).
  - `welcome_voucher` uses `entity_id = customer_id`, so it is sent once per Customer.
- Server-only: RLS on, no policy, `revoke all … from anon, authenticated`.
- `claim_migrated_customer` is SECURITY DEFINER, so it also gets `revoke execute … from anon,
  authenticated` (`20260917033807:39-40`).

## Voucher validation

`validateCoupon` gains `sessionCustomerId`. When `coupon.customer_id` is set, the coupon is valid
only if **both** of these hold:

- `sessionCustomerId === coupon.customer_id`;
- the checkout email resolves to that same Customer.

This keeps the **Order**, the per-customer count and the voucher on one row. Otherwise it fails
with *"This voucher belongs to an account. Sign in with the email it was sent to."*

There are three call sites, and each resolves the session Customer with
`getCurrentCustomerId()` (`lib/shop/customer-addresses.ts:30`: session → `customers.auth_user_id`).
Never trust an id from the request body.

- **Today the preview trusts the body.** `app/api/shop/coupons/validate/route.ts:33,54` takes
  `customer_id` from the request (sent by `lib/shop/cart-context.tsx:69` and
  `app/[lang]/shop/checkout/page.tsx:298`). This slice ignores that field and resolves the
  session instead; the browser callers stop sending it.
- **The server action has no callers.** `validateCouponCode` (`app/[lang]/shop/checkout/actions.ts:6`)
  is unused. Delete it in this slice rather than teach it the new rule.

- `app/api/shop/checkout/route.ts:512` (authoritative)
- `app/api/shop/coupons/validate/route.ts` (preview)
- `app/[lang]/shop/checkout/actions.ts:16` (server action, deleted; see above)

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
