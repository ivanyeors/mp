# 05 — *"Have us measure you"*: configurator entry and the fee on the customisation booking page

**Type:** AFK
**Blocked by:** 02
**User stories:** 7
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:configurator`

## Goal

A customer who opens the configurator and would rather not measure themselves can see, on the first screen, that the studio will do it, what it costs, and how to book. The fee is **not** charged here. It is charged when **Staff** measure them (slice 03). This slice only makes the option visible and the price honest.

## Scope

### Configurator

- **Where:** a secondary link on the `welcome` and `what-to-expect` steps. The step lists are in `lib/mp-config/flow-variant.ts:16-35` and `app/[lang]/mbolster-config/mbolster-config-client.tsx:199-201`. The what-to-expect copy is at `mp-config-client.tsx:3132-3138`.
- **Copy (en-US), with the price read from `service_prices`:**
  - Premium (`/mp-config`): *"Prefer our team to measure you? Get it customised, adjusted and bring home immediately for SGD 50.00. Book here"* (never "paid with your pillow" — it reads as if the pillow is the payment; #308)
  - Basic (`/mp-basic`): the same, with the Basic fee.
  - Mbolster: no fee — *"Prefer our team to measure you? Get it customised, adjusted and bring home immediately — no measurement fee for Mbolster. Book here"*
- **Link:** `/[lang]/appointments?type=customisation`.
- **Hidden** under **Staff assist mode** (they are already being measured), on an **Assist link** session, and on a **Partner-assisted** run.
- **Prices:** server-rendered from the page (`app/[lang]/mp-config/page.tsx`) through `loadServicePrices`, never from a client constant.

### Booking page — customisation type

On `/[lang]/appointments?type=customisation` (`components/slide-in-pages/booking-flow.tsx`), add one line above the form: *"Measurement service: SGD 50.00 for Premium Mpillow, SGD 30.00 for Basic Mpillow, none for Mbolster — get it customised, adjusted and bring home immediately."* Prices come from `service_prices`. No payment step is added to customisation booking.

### i18n

- Add the keys in `en-US` and `zh-CN` with an `{amount}` placeholder, never a literal `$50`.
- Format with the same SGD formatter the preview Ballpark uses.

## Acceptance criteria

- [ ] The link shows on `/mp-config`, `/mp-basic` and `/mbolster-config` with the right fee for each, and opens the customisation booking.
- [ ] Changing the fee in *Costings → Service fees* changes the link's amount on the next page load.
- [ ] The link is absent under **Staff assist mode**, on an `?assist=` session and on a partner-launched run.
- [ ] The customisation booking page states both fees and that nothing is paid at booking. The booking itself is unchanged: guest-friendly, no payment.
- [ ] No `$50` or `$30` literal is added to any i18n file (grep in the slice's test).
