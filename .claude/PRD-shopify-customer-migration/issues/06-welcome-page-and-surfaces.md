# 06 — Welcome page, Claim link, and the account and Admin Panel surfaces

**Type:** AFK
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

- [ ] The welcome page for an invalid token is identical to the page for no token.
- [ ] A Claim link never creates a session. A signed-out visitor holding one still has to
      complete Google or the code.
- [ ] The first sign-in through the welcome page shows the voucher on that same page load.
- [ ] The wrong-account state shows the switch link and leaks no name.
- [ ] Admin counts on the migration card match `migrated_customers` and `orders` queried by hand.
- [ ] vitest covers the page's state selection (the five states above) as a pure function.
- [ ] `./scripts/graphify update .` is run in the same commit.
