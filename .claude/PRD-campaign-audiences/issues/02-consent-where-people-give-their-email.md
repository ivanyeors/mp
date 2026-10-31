# 02 — Ask for consent where people give their email

**Issue:** not filed
**Type:** AFK, then HITL (counsel on the wording)
**Status:** checkout **built** (2026-10-31); customisation and booking not started
**Blocked by:** none (owner decision 1 settled: ticked by default; ADR 0037)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:storefront`, `area:email`

## Goal

A customer who buys here hears from us unless they say no, at the moment they give us their email
(owner, 2026-10-31). The demo: a guest checks out leaving the box ticked; their Customer shows
*Subscribed, from the box at checkout* and is in the *Everyone subscribed* Audience.

## What to build

- **One line, ticked by default** (owner decision 1): *Email me important updates, event invites
  and offers. No spam, unsubscribe anytime.* (`CHECKOUT_MARKETING_LABEL`). Never required, never
  inside the terms checkbox. Left ticked, it subscribes only a Customer nobody has asked
  (`set_marketing_email()` skips anyone else); unticked, it changes nothing.
- **Where:**
  - shop checkout: **built.** The box sits under the email; `marketing_email` in the request,
    absent meaning unticked; `recordCheckoutConsent()` after the Order is created, never failing
    the sale (`lib/marketing-consent/__tests__/checkout-consent.test.ts`);
  - the customisation contact step: Mpillow, Basic, Mbolster, a Paired build (asked once, on
    the anchor), the Assisted finish. At hold, a ticked box finds or creates the Customer by
    email and records consent (owner decision 1); unticked, the hold is unchanged;
  - appointment booking (`app/api/appointments/book/route.ts`), Customisation and Re-adjustment.
- **Still to do:** for a signed-in Customer who unsubscribed, show the box unticked; ticking it is
  then their own action and re-subscribes them as `account`. Chinese copy.
- **Migration:** `checkout` is in (`20261031090000_consent_by_default.sql`); add `customisation`
  and `appointment` (and `newsletter` for slice 03) the same way. Every write goes through
  `set_marketing_email()`.
- **The Customer timeline** names the source (*from the box at checkout*): built.
- **Privacy policy:** one line on marketing consent at checkout (HITL).

## Acceptance criteria

- [x] An unticked box writes nothing (checkout).
- [x] A ticked box never re-subscribes someone who unsubscribed (checkout).
- [ ] The tick is read from the request only as a boolean; the Customer is the server's.
- [ ] A Staff member's in-store device (Staff assist mode) shows the box to the shopper too, and
  the consent is the shopper's email, never the Staff login's.
- [ ] Counsel has read the wording, knowing the box is ticked by default (ADR 0037).
