# 02 — Ask for consent where people give their email

**Issue:** not filed
**Type:** AFK, then HITL (counsel on the wording)
**Status:** **built** at checkout, the customisation contact step and booking (2026-10-31).
Open: counsel on the wording, the privacy policy line, and the signed-in unsubscribed case
**Blocked by:** none (owner decision 1 settled: ticked by default; ADR 0039)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:storefront`, `area:email`

## Goal

A customer who buys here hears from us unless they say no, at the moment they give us their email
(owner, 2026-10-31). The demo: a guest checks out leaving the box ticked; their Customer shows
*Subscribed, from the box at checkout* and is in the *Everyone subscribed* Audience.

## What to build

- **One line, ticked by default** (owner decision 1): *Email me important updates, event invites
  and offers. No spam, unsubscribe anytime.* (`MARKETING_BOX_LABEL`). Never required, never
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

## As built (2026-10-31)

- **Migration** `20261031120000_consent_customisation_appointment.sql`: the sources
  `customisation` and `appointment` on both checks, and `set_marketing_email()` restated so each
  moves as `checkout` does (subscribe only, only someone nobody has asked, quietly skipping anyone
  else). Asserted by `supabase/tests/campaign-audiences/assert-02-consent-boxes.sql`.
- **One label**, `MARKETING_BOX_LABEL` (was `CHECKOUT_MARKETING_LABEL`), at checkout and on the
  customisation contact step; the booking form reads its own copy, with Chinese:
  *通过电子邮件接收重要通知、活动邀请和优惠。绝无垃圾邮件，可随时退订。*
- **`recordBoxConsent(admin, customerId, ticked, source)`** and **`recordBoxConsentByEmail(admin,
  email, ticked, source)`** in `lib/marketing-consent/consent.ts`; `recordCheckoutConsent` is the
  first with `checkout`. The second finds the Customer by the email typed, or creates one, only
  when ticked. Neither ever throws.
- **Customisation:** the box sits under the email in `PreviewContactFields`, so every contact step
  has it: Mpillow, Basic, Mbolster, and the Assisted customisation's questionnaire (on the Staff
  device, for the shopper's email). `/api/results/hold` takes `marketingEmail` and records it once
  every gate has passed and the Result is written. A Paired build sends it once, on the Mpillow;
  the Mbolster page sends false while paired. A finish link and a re-configuration ask for no
  email and send false.
- **Booking:** the box sits under the email in `BookingFlow`. `/api/appointments/book` (a guest's
  customisation visit) records it by email once the visit is on the calendar;
  `/api/readjustments/book` records it for the signed-in Customer once the visit stands, and
  `/api/readjustments/checkout` with the fee's Order.
- **The Customer page and timeline** name each: *from the box when they customised*, *from the box
  when they booked*.
- **Docs:** [`docs/data-flows/marketing-consent.md`](../../../docs/data-flows/marketing-consent.md).

## Acceptance criteria

- [x] An unticked box writes nothing (checkout, customisation, booking).
- [x] A ticked box never re-subscribes someone who unsubscribed (all three).
- [x] The tick is read from the request only as a boolean; the Customer is the server's (each
  route refuses a non-boolean, and finds the Customer itself).
- [x] A Staff member's in-store device (Staff assist mode) shows the box to the shopper too, and
  the consent is the shopper's email, never the Staff login's
  (`app/api/results/hold/__tests__/marketing-consent.test.ts`).
- [ ] Counsel has read the wording, knowing the box is ticked by default (ADR 0039).
- [ ] The privacy policy has a line on the box (HITL).
- [ ] A signed-in Customer who unsubscribed sees the box unticked, and ticking it re-subscribes
  them as `account` (not built: today the box is ticked for everyone, and skips them).
