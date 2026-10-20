# 08 — Check-up reminder: the yearly "time for a re-adjustment" for Premium Mpillow, which says it is paid

**Type:** AFK
**Blocked by:** 07, 13
**User stories:** 24
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:customers`, `area:email`, `area:whatsapp`, `area:readjustment`

## Decided

The owner decided on 2026-10-20:

- **A service message.** It is built here, as an **Aftercare message** under the same rules as
  slice 07's review request. It does not move to `PRD-email-marketing`.
- **Yearly.** 12 months after delivery.
- **It says plainly that the visit is paid.**
- **Both channels:** email and WhatsApp (slice 13), each honouring its own switch.
- **Premium Mpillow only.** Basic Mpillow and Mbolster owners get no check-up.

What makes it a service message, and must stay true:

- it is about a product the customer owns;
- it carries no offer, discount or other product;
- it honours the `aftercare_email` and `aftercare_whatsapp` switches;
- it goes at most once per milestone per Order.

If the copy ever needs an offer, it stops being an Aftercare message and belongs to email
marketing. Have counsel read the final copy once before it goes live; this is a check, not a
gate.

## Goal

A year after delivery, a Premium Mpillow owner hears that a re-adjustment keeps the pillow
fitting them, **and that it is a paid visit, at a stated price**. There are no surprises at
booking.

## The price, stated, from one source

The fee is read at send time from Costings, which is the single source of sell price:
`loadServicePrices(admin).readjustment.msrp` (`lib/pricing/service-prices.ts:58`; seeded at
S$30, `20261013100000_service_prices.sql:29`). It is never a constant in the template.

- **Email:** *"A re-adjustment is a paid visit: S${fee}, paid when you book."*
- **WhatsApp:** the fee is a template parameter. If the approved template has the price written
  into it instead, WhatsApp goes only while Costings' fee matches it (slice 13).
- **If the fee cannot be read, nothing is sent that day.** A check-up that does not say what it
  costs is not sent.

The email links to the Services page and to booking at
`/appointments?type=readjustment&item=<order_item_id>`. That page sends a signed-out visitor
through Sign in and back (`app/[lang]/appointments/page.tsx:49-56`), and charges the same fee
through the paid re-adjustment flow.

## Who gets it

This reuses slice 07's machinery: the same daily job, chained onto `results-sla`, and slice
13's channel decision.

- **Ledgers:**
  - email in `order_emails`, template `aftercare.checkup_<months>m`, so each milestone sends
    once per Order through `unique(order_id, template)`;
  - WhatsApp in `customer_whatsapp`, with the same template key and `entity_id = order_id`.
- **When:** the first run on or after `delivered_at + checkup_months` (12).
- **Skip:** a Customer with a **Re-adjustment booking** booked or attended within the previous
  `checkup_months`. Skipped Customers are counted, not sent.
- **Coverage: Premium Mpillow only** (owner, 2026-10-20). A line is covered when
  `classifyOrderLine` (`lib/readjustment/purchases.ts:80-122`) gives `productType = 'pillow'`
  and `tier = 'premium'`. It is read from `customer_purchase_lines` (slice 04), which has a parity
  check against that function; if slice 04 has not landed, call the function directly.
  - A pillow whose tier is unknown is not covered.
  - An Order with a Premium Mpillow and other lines gets one check-up for the Order.

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
- [ ] Each Order gets at most one check-up per milestone per channel, through the two ledgers.
- [ ] The rendered email and the WhatsApp parameters state the fee as read from Costings.
      Changing the price in Costings changes the next message. A failed price read sends
      nothing.
- [ ] No other price, offer or product appears.
- [ ] The Aftercare card shows check-ups sent by channel, skipped by reason, and bookings that
      followed.
- [ ] `./scripts/graphify update .` is run in the same commit.
