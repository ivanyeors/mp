# 06 — Welcome page, Claim link, and the account and Admin Panel surfaces

**Type:** AFK
**Blocked by:** 05
**User stories:** 1, 3, 6, 8, 11, 12
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:account`, `area:admin`

## Goal

One page where a campaign email lands: it greets the person by name, gets them signed in
in two taps, and shows them what they just got. Staff can see who has moved and what it cost.

## Claim link

```sql
create table customer_claim_links (
  customer_id     uuid primary key references customers(id) on delete cascade,
  token_hash      text not null unique,           -- sha256 of a 32-byte base64url token
  created_at      timestamptz not null default now(),
  first_clicked_at timestamptz null,
  last_clicked_at timestamptz null,
  click_count     int not null default 0
);
```

- There is one token per Customer. Like the **Assist link** precedent, the announcement and the
  reminder reuse it.
- The slice 08 sender creates the token lazily and only ever sees it in plaintext at send time.
- Service-role only.

## `/[lang]/account/welcome?c=<token>`

The page is `noindex`.

- **Signed out, token valid:** shows *"Welcome back, {first_name}. Your Mpillow account is
  ready."* It embeds `LoginForm` prefilled with that Customer's email, exactly as the Result
  status page does (`app/[lang]/results/[id]/page.tsx:805-823`), with `next` pointing back to
  this URL. Google sign-in sits beside it. Record the click.
- **Signed out, token missing, unknown or for a deleted Customer:** shows the same page with no
  name and an empty form. It never says whether a token was valid.
- **Signed in:**
  - calls `linkCustomerToAuthUser`, which claims (slice 05);
  - shows the **voucher card**: code, value, minimum spend, expiry date, *Copy*, *Shop now*;
  - shows *what your account does*: saved address (already imported), orders, re-adjustment
    booking, Results, returns.
- **Signed in as a different email than the token's Customer:** shows *"You're signed in as
  x@…. Your voucher was sent to the email you shopped with."*, with a switch-account link
  (`/account/login?reauth=1`). It shows no detail of the token's Customer beyond what the
  prefilled form would.

Add `utm_source=shopify_migration&utm_medium=email&utm_campaign=<template>` to every campaign
link, so GA4 and **Entry source** see the channel even though the claim ledger carries the funnel.

## Account

`/account` (**Profile**) shows the voucher card while the voucher is unused and unexpired, so a
customer who claimed organically still finds it.

## Admin Panel

These sit behind the existing `customers` and `discounts` permissions.

- **Customers list:** a "Shopify" filter (*all / claimed / not claimed*) and a small badge on
  migrated rows. The filter reads `migrated_customers`, not tags.
- **Customer detail:** a *From Shopify* panel showing Shopify-era orders and spend (labelled as
  not linked), Shopify tags and note, imported and claimed dates, and the consent snapshot.
- **Customers page header:** a migration card showing imported, claimed (with %), vouchers
  issued, vouchers redeemed, and revenue on redeemed orders. Revenue means paid **Orders** whose
  `coupon_id` is a `welcome_back` voucher; there is no new revenue path.
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
