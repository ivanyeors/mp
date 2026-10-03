# 03 — One sender address

Type: AFK · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

The ship-from address lives in one place: the default sender address on Couriers › Addresses. Live quotes and label purchases both use it. The duplicate Ship-from card on Connection is removed. When no default sender exists, Connection shows "No default sender address" with a link to the Addresses tab. Existing data carries over through a one-off seed.

Notes:
- Add `readSenderAddress()` in `lib/easyship/store.ts`. It returns the doc address with `default_for.sender`, or null.
- Point `lib/shipping/easyship.ts` (L174, L198), `quote.ts` (L44, L95) and `order-shipment.ts` at it. `missingOriginFields` takes that address.
- Seed migration on the `api_configs[slug=easyship]` jsonb: if there is no sender address, copy `shipping_settings.origin_address` in and set `default_for.sender = true`. Truncate to the doc limits (company ≤27, contact ≤22, line ≤35).

## Acceptance criteria

- [ ] Change the sender address on Addresses, and the next test quote uses the new origin postcode.
- [ ] A label purchase uses the same address.
- [ ] With no default sender, live methods are hidden and Connection shows the link to Addresses.
- [ ] The seed is a no-op when a sender address already exists, and copies a truncated address when one doesn't.
- [ ] `quote.test.ts` and `order-shipment.test.ts` are updated.
- [ ] Nothing in `lib` or `app` reads `shipping_settings.origin_address`.

## Blocked by

- 01

Can run alongside 02 and 04. 02 also edits `lib/shipping/quote.ts`, so rebase.
