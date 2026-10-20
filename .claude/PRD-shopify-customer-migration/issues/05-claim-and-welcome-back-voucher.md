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

- [x] Two concurrent `claim_migrated_customer` calls for one Customer result in one `claimed_at`
      and one voucher. Covered by a SQL assert, not a mock.
- [x] A non-migrated Customer signing in gets no voucher, and makes no write beyond today's.
- [x] After `welcome_voucher_issue_until`, a Claim stamps `claimed_at` and issues nothing.
- [x] Checkout with a bound voucher is refused for: a guest, a different signed-in Customer, and
      the owner checking out under a different email. It is accepted for the owner using their
      own email.
- [x] Every existing coupon test passes unchanged. A new vitest table covers the bound-coupon
      branch of `validateCoupon`. (The two tests of `validateCouponCode` went with the action
      this slice deletes; see Build notes.)
- [x] A Shopify customer booking a re-adjustment still sees "not listed" at the fee, unchanged
      (PRD user story 7).
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator
      rebuilds the graph after merging_

## Build notes

Built on `claude/shopify-migration-plan-izv7fo` @ `7e1983e`.

**What was built**

- **The Claim.** `lib/customer-migration/claim.ts`: `claimOnSignIn` calls
  `claim_migrated_customer` and, when the welcome email is due, sends it after the response
  (`after()`), so the first sign-in waits on the Claim but not on the mail server. It never
  throws: a failed Claim changes nothing and the next sign-in claims again.
  `linkCustomerToAuthUser` (`lib/auth/customer-identity.ts`) calls it after the link, for every
  decision type, only when the row is bound to the signed-in user. Nothing calls
  `supabase.auth.admin.*`, and `linkCustomerToAuthUser` stays the only binding path.
- **Voucher validation.** `lib/ecommerce/discounts.ts`: `validateCoupon` checks a bound coupon
  first, before expiry, limits or scope, so a forwarded code tells its holder nothing. The rule is
  the pure `mayUseBoundCoupon`. The session comes from `getCurrentCustomerId` at both call sites
  (`app/api/shop/coupons/validate/route.ts`, `app/api/shop/checkout/route.ts`); the preview no
  longer accepts `customer_id` from the body. `validateCouponCode` is deleted. A coupon with
  `customer_id` null takes exactly the old path, and never resolves the session.
- **The ledger.** `lib/email/customer-emails.ts`: `claimCustomerEmail`, `markCustomerEmailSent`,
  `markCustomerEmailFailed` (returns whether the attempt count leaves a retry) and
  `dispatchCustomerEmail` (claim → render → send → mark, never throws). CRM 07 and 08 can use
  `dispatchCustomerEmail` as it stands, with their own template and entity.
- **The email.** `lib/email/account.ts` `renderWelcomeVoucherEmail`, registered as
  `account.welcome_voucher` (plus a free-shipping variant for the preview and contract tests) in a
  new `account` email group.

**Migrations** (block `20261020112000`–`20261020112959`)

- `20261020112000_customer_emails.sql`: the `customer_emails` table exactly as specified,
  server-only (RLS on, no policy, `revoke all` from `anon, authenticated`, and on its sequence),
  and `claim_customer_email(customer, template, entity)`. That is one `insert … on conflict do
  update … where status = 'failed' and attempts < 3`, so a fresh claim and a retry are each atomic.
  Service role only.
- `20261020112100_welcome_back_voucher.sql`: `coupons.customer_id` and `issued_for`, the
  `coupons_one_per_customer_purpose` unique index, the six `welcome_voucher_*` keys (seeded
  `enabled = 'false'` and `valid_days = '60'` only), and `claim_migrated_customer` (SECURITY
  DEFINER, service role only).
- Both apply cleanly in order and re-apply idempotently on Postgres 16 with the Supabase stubs.

**Tests**

- `supabase/tests/customer-migration/assert-05-claim.sql` runs against a migrated throwaway
  database (`psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f …`; prints `slice 05 claim ok`). It
  asserts:
  - **The race.** It is real: two `dblink` sessions, the second asserted blocked behind the first's
    uncommitted Claim, giving one `claimed_at` and one voucher.
  - **The index on its own.** It refuses a second voucher even with `claimed_at` cleared.
  - **The non-migrated Customer.** `txid_current_if_assigned()` is null after their call, so
    nothing was written.
  - **The terms.**
    - After `issue_until`, the Claim is stamped and nothing is issued.
    - The seeded default and unset terms issue nothing.
    - A malformed value issues nothing and raises nothing.
  - **The voucher.** Its code shape, value, minimum, single use, and the expiry at Claim + 60
    days.
  - **The ledger.** Retries run up to 3 attempts, and a sent row is final.
  - **The email.** It is due only for an unused, unexpired voucher.
  - **Grants.** None for the client roles, and `authenticated` reads no coupon.

  It was mutation-checked: with the `claimed_at` guard removed, the race assert fails.
- vitest:
  - `lib/ecommerce/__tests__/bound-coupon.test.ts`: the `mayUseBoundCoupon` table, plus
    `validateCoupon` for each refusal and acceptance, the bearer path never resolving the
    session, and no expiry leak to a stranger.
  - `app/api/shop/checkout/__tests__/bound-voucher.test.ts`: the real checkout handler and the
    real `validateCoupon`. Refused for a guest, a different Customer, and the owner under another
    email. Accepted for the owner's own email.
  - `app/api/shop/coupons/validate/__tests__/bound-voucher.test.ts`: the body's `customer_id` is
    ignored.
  - `lib/email/__tests__/customer-emails.test.ts`: claim, mark sent, mark failed and its attempt
    count, and dispatch.
  - `lib/customer-migration/__tests__/claim.test.ts`: the RPC mapping, no email or table access
    for a non-migrated Customer, the deferred send, and the email data. A parity check confirms
    the SQL names the same template and attempt limit as the code.
  - `lib/auth/__tests__/customer-identity-claim.test.ts`: the Claim runs for every decision
    type, and never for a row another login holds.
- The re-adjustment criterion is met by not touching it: no `lib/readjustment` file changed, and
  `eligibility.test.ts` ("an unlisted purchase pays the fee") passes as before.

**Grants on `coupons`.** No grant was added, and none is needed. A customer's session never
reads `coupons`. Checkout, the preview and the Claim all read it through the service role, and its
one policy has been scoped to `service_role` since `20260902000000`. The SQL assert checks that
`authenticated` sees no coupon row. One dependency to keep in mind for CRM 02's column grants on
`customers`: `getCurrentCustomerId` reads `customers.id` filtered on `auth_user_id` under the
customer's own session, so both columns must stay selectable by `authenticated`.

**Deviations**

- **`validateCoupon` gains `getSessionCustomerId`, a resolver, not a `sessionCustomerId`
  value.** Only a bound coupon calls it, so a bearer code costs no auth round trip. That is why
  every existing coupon and checkout test passes without a session mock.
- **The browser callers already sent no `customer_id`.** `lib/shop/cart-context.tsx:69` and
  `app/[lang]/shop/checkout/page.tsx:298` send `email` only, so nothing changed there. The route
  drops the field from its schema, and zod strips it if a stale client sends one.
- **Two existing tests were deleted.** These are the `validateCouponCode server action` tests in
  `public-validators.test.ts`, removed with the action itself, as the slice asks. Every other
  coupon test is unchanged.
- **`claim_migrated_customer(p_customer_id)` returns `claimed`, `voucher_issued` and
  `welcome_email_due`,** not only whether a voucher was issued. The third column is how a failed
  welcome email is retried on a later sign-in without a cron (`vercel.json` keeps two). It costs
  two index probes inside the same RPC, and no extra round trip. The `p_` prefix follows slice 02.
- **The ledger template is the registry id `account.welcome_voucher`,** not the bare
  `welcome_voucher`. This matches the form CRM 07 uses (`aftercare.review_request`).
- **The voucher insert targets only the one-per-purpose index on conflict.** A code collision
  (50 random bits) therefore raises and rolls the Claim back, and the next sign-in claims again.
  The alternative was stamping a Claim with no voucher.
- **Additive schema.** A `coupons_issued_for_bound` check (a purpose-issued coupon always has a
  Customer), and `idx_coupons_customer` for the cascade from `customers`.
- **A free-shipping voucher stores `discount_value = 1`.** The CHECK requires > 0, and
  `computeCouponDiscountAmount` ignores the value for free shipping.

**Left for ops and the owner**

- **Owner decision 2.** Set `welcome_voucher_type`, `welcome_voucher_value`,
  `welcome_voucher_min_order` (blank = none), `welcome_voucher_issue_until` and
  `welcome_voucher_enabled = 'true'`. Slice 06's card is the editor. Until then no voucher is
  issued.
- **Set the terms before slice 04 imports into production.** A Claim happens once. A Migrated
  customer who signs in while issuance is off is Claimed with no voucher, and never gets one
  later.
- **Scope (decision 2) is not a setting.** The slice lists no key for it, so the voucher applies
  to the whole shop cart (`applies_to` null). An accessories-only voucher needs one more key.
- **For the owner or counsel: the voucher email and consent.** The PRD's *Who receives what*
  table says the no-consent group sees the voucher on the site, not in their inbox. This slice
  calls the `welcome_voucher` email transactional and sends it whatever the consent, and this
  build follows the slice. If counsel reads it as a commercial message, gate the send in
  `claimOnSignIn` on Marketing consent (slice 07), or on
  `migrated_customers.email_marketing_at_export` until slice 07 lands.
- **A `pending` row left by a crash between claim and mark is never retried.** `order_emails`
  behaves the same way.
