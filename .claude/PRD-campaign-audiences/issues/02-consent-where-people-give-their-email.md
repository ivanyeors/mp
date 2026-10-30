# 02 — Ask for consent where people give their email

**Issue:** not filed
**Type:** AFK, then HITL (counsel on the wording)
**Status:** not started
**Blocked by:** 01 (owner decision 1)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:storefront`, `area:email`

## Goal

A customer who buys here can choose to hear from us, at the moment they give us their email. The
demo: a guest checks out with the box ticked; their Customer shows *Email: subscribed · at
checkout* and is in the *Everyone subscribed* Audience.

## What to build

- **One component**, *Email me news and offers* (`MARKETING_EMAIL_LABEL`), unticked, with one
  line saying what they will get and that every email has an unsubscribe link. English and
  Chinese. Never pre-ticked, never required, never inside the terms checkbox.
- **Where:**
  - shop checkout (`app/api/shop/checkout/route.ts`, after `findOrCreateCustomer`);
  - the customisation contact step: Mpillow, Basic, Mbolster, a Paired build (asked once, on
    the anchor), the Assisted finish. At hold, a ticked box finds or creates the Customer by
    email and records consent (owner decision 1); unticked, the hold is unchanged;
  - appointment booking (`app/api/appointments/book/route.ts`), Customisation and Re-adjustment.
- **Hidden** when the Customer is already `subscribed`. Shown to an `unsubscribed` Customer, since
  ticking it is their own action.
- **Migration:** widen the `marketing_email_source` and `customer_consent_events.source` checks
  with `checkout`, `customisation`, `appointment` (and `newsletter` for slice 03). Every write
  goes through `set_marketing_email()`.
- **The Customer timeline** names the source (*Subscribed at checkout*).
- **Privacy policy:** one line on marketing consent at checkout (HITL).

## Acceptance criteria

- [ ] An unticked box writes nothing; the route tests prove it.
- [ ] The tick is read from the request only as a boolean; the Customer is the server's.
- [ ] A Staff member's in-store device (Staff assist mode) shows the box to the shopper too, and
  the consent is the shopper's email, never the Staff login's.
- [ ] Counsel has approved the wording.
