# 02 — No fallback; live is the default

Type: AFK · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

A live-rate method that gets no courier quote is hidden at checkout. This covers an outage, no rates, and a currency mismatch. It is never priced at its flat base rate. The global "Live rates for shoppers" switch and the "Fallback rate" concept are deleted. New methods default to live rates; existing methods are untouched. When no active flat method exists, the Methods page warns staff: "If couriers can't be reached, checkout shows no shipping option."

Notes:
- `lib/shipping/quote.ts` `priceMethod` (L201-219): replace both `flatOption(method, subtotal, "fallback")` returns with `null`. Delete the `"disabled"` branch at L93 and the `easyship_enabled` read.
- Remove the switch from the panel, from `ShippingSettingsSchema`, from `/api/shop/shipping/settings`, and from the forced `easyship_enabled: true` in `settings/test/route.ts:48`.
- Live methods hide base rate in the form. Remove the "Fallback {rate}" from method cards.
- Migration: `alter table shipping_methods alter column rate_source set default 'easyship'`.
- Update the `live` semantics in `app/api/shop/shipping/quote/route.ts` and `lib/shop/use-shipping-quote.ts`. Checkout (`app/api/shop/checkout/route.ts:554-580`) already returns 400 for a hidden method; check the copy covers an outage too.
- Write a new ADR superseding "fail open on outages" in `docs/adr/0020-easyship-live-shipping-rates.md`, and renumber the duplicate 0020.

## Acceptance criteria

- [ ] `quote.test.ts` covers four cases: an outage hides the live method, no rates hides it, a currency mismatch hides it, and flat methods are unaffected.
- [ ] With the token unset, only flat methods are quoted at checkout.
- [ ] The new-method form opens with live courier rate selected, and the DB default matches.
- [ ] The warning shows only when no active flat method exists.
- [ ] No "fallback" or live-rates-switch copy remains in the UI.
- [ ] The new ADR is in `docs/adr/`, with no duplicate numbers.

## Blocked by

- 01 (copy and page location)
