# 06 — Welcome page, Claim link, and the account and Admin Panel surfaces

**Issue:** [#270](https://github.com/ivanyeors/mp/issues/270) (parent #264)
**Type:** AFK
**Status:** built in `43ec93d` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 05, 12
**User stories:** 1, 3, 6, 8, 11, 12
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:customer-accounts`

## Goal

One page where a campaign email lands: it greets the person by name, gets them signed in
in two taps, and shows them what they just got. Staff can see who has moved and what it cost.

## Claim link

```sql
create table customer_claim_links (
  id               bigserial primary key,
  customer_id      uuid not null references customers(id) on delete cascade,
  token_hash       text not null unique,          -- sha256 of a 32-byte base64url token
  template         text not null,                 -- which campaign email carried it
  created_at       timestamptz not null default now(),
  first_clicked_at timestamptz null,
  last_clicked_at  timestamptz null,
  click_count      int not null default 0
);
create index on customer_claim_links (customer_id);
```

- **One token per email sent.** Only the hash is stored, so a token cannot be read back and
  reused: the announcement and the reminder each mint their own. Every token stays valid, so an
  old email still works after a newer one went out. (The **Assist link** stores its code in
  plaintext, `20260912000000_admin_assist_code.sql:10`, which is why it can be reused; a claim
  link is a per-customer capability and must not be.)
- The slice 08 sender mints the token at send time, writes the hash, and puts the plaintext only
  in that email.
- **An email change voids the tokens.** Staff can change a Customer's email
  (`updateCustomer`, `app/[lang]/settings/customers/actions.ts:11`). For a Migrated customer
  who has not claimed, that change deletes their claim links, so an old email cannot claim for
  the new address.
- Server-only: RLS on, no policy, `revoke all … from anon, authenticated`.

## `/[lang]/account/welcome?c=<token>`

The page is `noindex`.

- **Signed out, token valid:** shows *"Welcome back, {first_name}. Your Mpillow account is
  ready."* It embeds `LoginForm` prefilled with that Customer's email, exactly as the Result
  status page does (`app/[lang]/results/[id]/page.tsx:1000-1018`), with `next` pointing back to
  this URL. Google sign-in sits beside it. Record the click.
- **Signed out, token missing, unknown or for a deleted Customer:** shows the same page with no
  name and an empty form. It never says whether a token was valid.
- **Signed in:**
  - calls `linkCustomerToAuthUser`, which claims (slice 05);
  - shows the **voucher card**: code, value, minimum spend, expiry date, *Copy*, *Shop now*;
  - shows *what your account does*: saved address (already imported), orders, re-adjustment
    booking, Results, returns.
- **Signed in as a different email than the token's Customer:** shows *"You're signed in as
  x@…. Your voucher was sent to the email you shopped with."*, with a *Use another account*
  button. It signs out and returns to this URL, so the prefilled form shows. It must not link to
  `/account/login?reauth=1`: that parameter belongs to the Partner Hub's 7-day cap and shows
  *"Your Partner Hub session has expired"* (`app/[lang]/account/login/page.tsx:45-47`). It shows
  no detail of the token's Customer beyond what the prefilled form would.

Add `utm_source=shopify_migration&utm_medium=email&utm_campaign=<template>` to every campaign
link, so GA4 and **Entry source** see the channel even though the claim ledger carries the funnel.

## Account

`/account` (**Profile**) shows the voucher card while the voucher is unused and unexpired, so a
customer who claimed organically still finds it.

## Admin Panel

These sit behind the existing `customers` and `discounts` permissions. The Account column, the
Shopify badge and filters, and the *From Shopify* card already exist from slice 12. This slice
adds what the Claim link and the voucher make knowable.

- **Customer overview:** `create or replace view admin_customer_overview` adds
  `claim_link_first_clicked_at` and `welcome_voucher_state` (*none / issued / used / expired*).
- **Customers list:** a *Voucher* filter (*issued, unused* / *used*). *Issued, unused* is the
  list to nudge before the vouchers expire.
- **Customer detail:** the *From Shopify* card gains the Claim link's first click and the
  voucher's code, state and expiry.
- **Migration card:** add *Clicked*, *Voucher used* and *Revenue*. Revenue means paid **Orders**
  whose `coupon_id` is a `welcome_back` voucher; there is no new revenue path.
- **Discounts:**
  - hide account-bound vouchers from the list by default, with a toggle to show them;
  - add a *Welcome-back voucher* card that edits the slice 05 `site_settings` keys, and shows
    the live liability (issued × value) beside the realised cost (redeemed × value).

## Acceptance criteria

- [x] The welcome page for an invalid token is identical to the page for no token.
- [x] A Claim link never creates a session. A signed-out visitor holding one still has to
      complete Google or the code.
- [x] The first sign-in through the welcome page shows the voucher on that same page load.
- [x] The wrong-account state shows the switch link and leaks no name.
- [x] Admin counts on the migration card match `migrated_customers` and `orders` queried by hand.
- [x] vitest covers the page's state selection (the five states above) as a pure function.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

Built on `claude/shopify-migration-plan-izv7fo` @ `c351aca`.

**What was built**

- **The Claim link.** `lib/customer-migration/claim-link.ts`: `generateClaimToken` (32 random
  bytes, base64url), `hashClaimToken` (SHA-256 hex, through the existing `sha256Hex`),
  `claimLinkUrl` and `withCampaignUtm` (`utm_source=shopify_migration&utm_medium=email&
  utm_campaign=<template>`), `mintClaimLink` for the slice 08 sender, and `openClaimLink`, which
  records the click and returns whose link it is. It never throws, never logs the token, and
  never looks up a malformed one.
- **The welcome page.** `app/[lang]/account/welcome/` (`page.tsx`, `welcome-view.tsx`), `noindex`.
  - `lib/customer-migration/welcome.ts`: `selectWelcomeState`, the pure state selection.
  - `lib/customer-migration/welcome-page.ts`: `loadWelcomePage`, which takes its reads as
    arguments. Signed in, it awaits `linkCustomerToAuthUser` (which runs the slice 05 Claim)
    before it reads the voucher, so the first sign-in shows the voucher on that page load.
  - Signed out, it embeds `LoginForm` as the Result status page does, with Google beside the
    code, and returns to the same URL.
  - Wrong account: *Use another account* posts to `/auth/signout?next=<this URL>`, never
    `/account/login?reauth=1`.
  - Signed in: the voucher card, then *What your account does* (addresses, orders, re-adjustment,
    Results, returns).
- **The voucher card.** `components/account/welcome-voucher-card.tsx`: code, value, minimum,
  expiry, *Copy*, *Shop now*. It is on the welcome page and on `/account` (Profile), while the
  voucher is unused and unexpired. `lib/customer-migration/welcome-voucher.ts` holds
  `welcomeVoucherState`, `readWelcomeVoucher`, the card text and the Discounts figures.
- **Customers.**
  - The overview and `CUSTOMER_OVERVIEW_COLUMNS` gain `claim_link_first_clicked_at` and
    `welcome_voucher_state`.
  - The list gains a *Voucher* filter (`voucher=issued|used`, in `lib/crm/customer-filters.ts`).
  - The Migration card gains *Clicked*, *Voucher used* and *Revenue*.
  - The From Shopify card gains the first click and the voucher's code, state and expiry
    (`getMigratedCustomer` reads them from the overview and `coupons`).
- **Discounts.**
  - `listAdminCoupons` hides account-bound vouchers unless `bound=show`, and the list has a
    *Show account-bound vouchers* toggle (kept in the URL) and a *Welcome-back* badge.
  - The *Welcome-back voucher* card (`app/[lang]/settings/discounts/welcome-voucher-card.tsx`)
    edits the six slice 05 terms through `GET`/`PUT /api/settings/discounts/welcome-voucher`.
    Both need `discounts`, and every change is audited. The card says what a Claim made now
    would do, and shows the live liability beside the realised cost.
  - `lib/customer-migration/welcome-voucher-terms.ts` parses and writes the terms exactly as
    `claim_migrated_customer` reads them, and `welcomeVoucherIssuing` mirrors its conditions.
- **The account shell** (`components/account/account-sidebar-nav.tsx`) leaves
  `/account/welcome` bare, as it does `/account/login`. Otherwise a signed-out visitor would be
  redirected to sign-in and lose the `?c=`.

**Migrations**

- `20261020121000_customer_claim_links.sql`:
  - the table as specified, plus checks: `token_hash` must be 64 hex characters, so a plaintext
    token cannot be stored, and `template` must not be blank;
  - server-only (RLS on, no policy, `revoke all` on the table and its sequence);
  - `mint_claim_link` and `open_claim_link`, both service role only;
  - the `trg_customers_void_claim_links` trigger.
- `20261020121100_welcome_voucher_state.sql`: `welcome_voucher_state(usage_count, is_active,
  expires_at)`, the one rule for the voucher's state, and `admin_welcome_voucher_summary` for
  the Discounts card. The view is server-only.
- `20261020200100_customer_overview_claim_and_voucher.sql` (the shared-views range):
  - `admin_customer_overview` with every column slice 12 and CRM 11 (`account_providers`,
    `has_phone`, `phone_valid`, from `20261020200000_customer_overview_contact_status.sql`)
    had, plus the two new ones;
  - `admin_customer_migration_summary` plus `clicked`, `vouchers_issued`, `vouchers_used`,
    `voucher_orders` and `voucher_revenue`.
- All apply in order on Postgres 16 with the Supabase stubs (`db-check.sh`), and re-apply
  idempotently.

**Tests**

- `supabase/tests/customer-migration/assert-06-welcome.sql` (prints `slice 06 welcome asserts
  ok`) checks:
  - grants: nothing for `anon` or `authenticated` on the table, its sequence, the three
    functions or the summary view;
  - minting: one row per email, no plaintext, no duplicate hash;
  - clicks: a signed-out open counts, a signed-in open counts only as a first click, an unknown
    token returns nothing, and an older email still works;
  - email changes: a case-only change keeps the links, and a real change voids them for an
    unclaimed Customer but not a Claimed one;
  - the state rule's table;
  - the overview's columns and its *Issued, unused* filter;
  - the Migration card against `migrated_customers`, `coupons` and `orders` counted by hand
    (unpaid and bearer-code orders excluded);
  - the Discounts figures;
  - the undo keeps an emailed Customer, and a deleted Customer takes their links.

  Two mutations were checked: dropping the trigger's Claim guard, and counting every signed-in
  visit. Each fails its assert. Slice 05's and 12's asserts still pass.
- vitest:
  - `lib/customer-migration/__tests__/welcome.test.ts`: the five states, an invalid token equal
    to no token, and the wrong-account state carrying nothing of the token's Customer.
  - `welcome-page.test.ts`: the voucher on the first sign-in's own load, read after the Claim;
    click counting; and no voucher read signed out or for the wrong account.
  - `claim-link.test.ts`: the token, its hash, the URL and UTMs, minting and opening.
  - `welcome-voucher.test.ts`: the state rule, the card, the terms (parse, write, issuing,
    schema).
  - `app/[lang]/account/welcome/__tests__/welcome-render.test.tsx`:
    - an invalid token renders byte for byte as no token;
    - the wrong-account screen has the switch and no name;
    - the voucher card renders;
    - none of the page's files calls anything that signs in or makes a login.
  - `app/[lang]/settings/customers/__tests__/claim-and-voucher-render.test.tsx`: the card's new
    cells, the Voucher filter, and the From Shopify rows.
  - `app/api/settings/discounts/__tests__/welcome-voucher-route.test.ts`: `discounts` is
    required (`customers-edit` is not enough), incomplete terms cannot turn issuing on, values
    are stored as the SQL reads them, and changes are audited.
  - `app/[lang]/settings/discounts/__tests__/bound-vouchers.test.tsx`: bound vouchers are hidden
    by default, and the toggle, badge and cost figures render.
  - The filter, overview and slice 12 render tests are extended for the new columns.

**Deviations**

- **`updateCustomer` no longer exists** (CRM 02 deleted it). Instead of patching
  `PATCH /api/shop/customers/[id]`, a trigger on `customers` voids the Claim links on any email
  change, so no write path can forget. It is SECURITY DEFINER, because both tables are service
  role only. The route carries a comment pointing at it.
  - *Not Claimed* means "no `migrated_customers` row with `claimed_at`". Links left on a
    Customer who is no longer Migrated (an undone merge) are voided too.
  - A case-only change is the same address and keeps the links.
- **A signed-in visit records a first click only.** The slice says to record the click when
  signed out. A visitor who arrives already signed in has also clicked, so their first click
  counts. The return trip from signing in (whose `next` is the same URL) does not count again.
- **Minting is a SQL function, and hashing uses WebCrypto.** The slice 02 guard test requires
  every write from `lib/customer-migration` to go through a SQL function, and it matches
  `.update(` (which `createHash().update()` would trip). `hashClaimToken` is therefore async.
- **The signed-out form returns to the token only when the token resolved.** That is what
  makes an invalid token's page byte-identical to no token's. Someone who signs in from an
  invalid link sees the plain signed-in page.
- **`expired` also covers a voucher switched off in Discounts** (`is_active = false`, unused).
  It is unusable, and the four states the slice names stay four.
- **The Discounts card has its own view**, `admin_welcome_voucher_summary`, in this slice's
  block rather than the shared summary, so other slices need not carry its columns. Each voucher
  is valued at its own `discount_value`:
  - *Live liability* is unused, still-usable vouchers × value;
  - *Issued* shows every voucher at face value;
  - *Realised cost* is redeemed × value.

  A free-shipping voucher is counted but not valued, because an Order does not record the
  shipping it waives.
- **Revenue** is `sum(orders.total)` over Orders with `paid_at` set whose coupon is a
  Welcome-back voucher. A later refund is not subtracted.
- **Turning issuing on requires a type, a value (for a fixed amount) and a last issue day.** A
  last day already past is allowed (the card says issuing has ended), so a lapsed campaign can
  still be edited.
- **An import undo keeps a Customer with a Claim link.** `customer_import_undo_plan` reads every
  foreign key to `customers`, so an emailed Customer counts as referenced. An undo after a wave
  therefore keeps the Customers it emailed, and their links keep working.
- **Link scanners.** Some mail security scanners fetch links before a person does, which counts
  as a click. A JavaScript beacon would filter most of them; this build records the click on the
  server, as the slice says.

**Left for ops and the owner**

- **Owner decision 2.** Set the terms in Discounts → *Welcome-back voucher* before slice 04
  imports into production. A Claim made while issuing is off never issues a voucher later.
  Scope (accessories only) is still not a setting.
- **GA4.** The token is in the welcome page's URL, so GA4 records it in `page_location`. Add `c`
  to the web stream's URL query-parameter redaction (Admin → Data streams → Redact data).
- **Apply the three migrations before the code.** The new code reads the new views and
  functions, and the old code keeps working with them in place.

**After merging CRM 03, 07 and 11**

- **The overview redefinition moved to `20261020200100`.** CRM 11 had also taken
  `20261020200000`, and its file sorted after this one, so its definition would have run last
  and dropped this slice's columns. This slice's redefinition now carries CRM 11's three
  columns, then its own two. CRM 11's SQL assert and slice 05's, 06's and 12's all pass on
  the merged schema.
- **The Customers list** keeps CRM 11's Google and Mobile filters beside the Voucher filter.
  Like those, `voucher` is optional in the list's initial filters.
- **The CRM timeline** has a `claim_link.opened` source (`lib/crm/timeline/sources/claim-links.ts`,
  gated by `customers`, under the Account chip). It adds one entry per Claim link at its first
  click, with the open count in the line, and never reads the token. The send itself belongs to
  slice 08's ledger. `timeline-route.test.ts` covers it.
