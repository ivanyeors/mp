# 08 — Check-up reminder: the yearly "time for a re-adjustment" for Premium Mpillow, which says it is paid

**Issue:** [#285](https://github.com/ivanyeors/mp/issues/285) (parent #277)
**Type:** AFK
**Blocked by:** 07, 13; migration slice 07 (Marketing consent)
**User stories:** 24
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:storefront`, `area:email`, `area:admin`

## Decided

The owner decided on 2026-10-20:

- **A service message.** It is built here, as an **Aftercare message** under the same rules as
  slice 07's review request. It does not move to `PRD-email-marketing`.
- **Yearly.** 12 months after delivery.
- **It says plainly that the visit is paid.**
- **Both channels:** email and WhatsApp (slice 13), each honouring its own switch.
- **Premium Mpillow only.** Basic Mpillow and Mbolster owners get no check-up.

What keeps it an Aftercare message, and must stay true:

- it is about a product the customer owns;
- it carries no discount and no other product;
- it honours the `aftercare_email` and `aftercare_whatsapp` switches;
- it goes at most once per milestone per Order.

If the copy ever needs an offer, it belongs to email marketing.

## Consent: what the research changed (2026-10-20)

Research on Singapore law and Meta's rules says a reminder that offers a **paid** visit is
marketing, whatever we call it:

- **PDPA.** Offering a paid service is direct marketing. The PDPC says direct marketing needs
  **express consent**: deemed consent by notification and the legitimate-interests exception
  cannot be used for it. The "ongoing relationship" exclusion does not cover a one-off purchase.
- **Do Not Call.** The WhatsApp check-up is a "specified message". It needs clear, evidenced
  consent that names it, or a check against the Do Not Call register.
- **Meta** decides the WhatsApp template's category. It is submitted as Utility (owner,
  2026-10-20) and may come back as Marketing (slice 13). That changes the price per message, not
  who may receive it: consent is the PDPA question above.

So the check-up is still built here as the owner decided, but it goes **only to customers who
agreed**:

- **Email:** `aftercare_email` is on **and** **Marketing consent** is `subscribed` (migration
  slice 07). That consent comes from the Shopify export's "accepts marketing" or the Profile's
  *"Email me news and offers"*.
- **WhatsApp:** `aftercare_whatsapp` is on. Its opt-in wording already names the paid check-up
  (slice 13).

This is the one Aftercare rule that reads `marketing_email` (README, second hazard).

**The owner's call, with counsel.** If counsel advises that a customer who bought a Premium
Mpillow may be reminded by email without marketing consent, drop the `marketing_email`
condition. It is one line in the candidate query and its test. Until then the safe rule stands.

## Goal

A year after delivery, a Premium Mpillow owner hears that a re-adjustment keeps the pillow
fitting them, **and that it is a paid visit, at a stated price**. There are no surprises at
booking.

## The price, stated, from one source

The fee is read at send time from Costings, which is the single source of sell price:
`loadServicePrices(admin).readjustment.msrp` (`lib/pricing/service-prices.ts:58`; seeded at
S$30, `20261013100000_service_prices.sql:29`). It is never a constant in the template.

- **Email:** *"A re-adjustment is a paid visit: S${fee}, paid when you book."*
- **WhatsApp:** the fee is the fourth body parameter of `aftercare_checkup` (slice 13), formatted
  as `S$30`, never written into the template.
- **If the fee cannot be read, nothing is sent that day.** A check-up that does not say what it
  costs is not sent.

The email uses slice 07's footer, including *"…or reply to this email and we'll do it for
you"*. Because it goes only to customers who agreed, it is not unsolicited, so the Spam
Control Act's `<ADV>` subject label does not apply.

The email links to the Services page and to booking at
`/appointments?type=readjustment&item=<order_item_id>`. That page sends a signed-out visitor
through Sign in and back (`app/[lang]/appointments/page.tsx:49-56`), and charges the same fee
through the paid re-adjustment flow.

## Who gets it

This reuses slice 07's machinery: the same daily job, chained onto `results-sla`, and slice
13's channel decision.

- **Ledgers:**
  - email in `customer_emails` (slice 07), template `aftercare.checkup_<months>m`,
    `entity_id = order_id`, so each milestone sends once per Order. A failed send is retried up
    to 3 attempts. `order_emails` is not used: its failed rows are final, and
    `dispatchOrderEmail` takes only the eight order templates (`lib/email/types.ts:10-18`);
  - WhatsApp in `customer_whatsapp`, with the same template key and `entity_id = order_id`.
- **When:** the first run on or after `delivered_at + checkup_months` (12).
- **Skip:** a Customer with a **Re-adjustment booking** booked or attended within the previous
  `checkup_months`. Skipped Customers are counted, not sent.
- **Coverage: Premium Mpillow only** (owner, 2026-10-20). A line is covered when
  `classifyOrderLine` (`lib/readjustment/purchases.ts:80-122`) gives `productType = 'pillow'`
  and `tier = 'premium'`. It is read from `customer_purchase_lines` (slice 04), which has a parity
  check against that function; if slice 04 has not landed, call the function directly.
  - A pillow whose tier is unknown is not covered.
  - An Order with a Premium Mpillow and other lines gets one check-up for the Order. A
    **Paired build** is exactly that case: one Order with a Custom Mpillow and a Custom
    Mbolster, each line classified from its own Result snapshot (ADR 0026).

## Settings

These are `site_settings` keys, edited on slice 07's Aftercare card:

- `checkup_reminders_enabled` (default **false**);
- `checkup_months` (12).

Coverage is not a setting. It is Premium Mpillow, in code, with its test.

## Acceptance criteria

- [ ] vitest covers the timing and skip rules as a pure function: on time, already re-adjusted
      within the period, opted out per channel, and not delivered.
- [ ] A Basic Mpillow, an Mbolster, and a pillow of unknown tier get no check-up. A Premium
      Mpillow bought alongside them does.
- [ ] A Customer whose Marketing consent is not `subscribed` gets no check-up email. If they
      opted in to WhatsApp, they still get the WhatsApp one. The candidate query's test pins
      both.
- [ ] Each Order gets at most one check-up per milestone per channel, through the two ledgers.
- [ ] The rendered email and the WhatsApp parameters state the fee as read from Costings.
      Changing the price in Costings changes the next message. A failed price read sends
      nothing.
- [ ] No other price, offer or product appears.
- [ ] The Aftercare card shows check-ups sent by channel, skipped by reason, and bookings that
      followed.
- [ ] `./scripts/graphify update .` is run in the same commit.
