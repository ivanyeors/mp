# 04 — One box list

Type: AFK · Labels: `needs-triage`

## Parent

`../shipping-couriers-prd.md`

## What to build

Package sizes come from the courier account's Boxes. Each item type (pillow, bolster, accessory) points at one box and adds its own content weight. On the Boxes tab, each box shows "Used for" chips, so staff can see and change the mapping. The Packaging card on Connection is removed. A type with no box gets no live quote, and the Couriers card warns about it. Current package profiles are seeded as boxes.

Notes:
- Store `box_for_type: { pillow|bolster|accessory: { box: <box name>, weight_grams } }` on the doc. It isn't pushed, because the sync ignores unknown keys.
- `buildParcels` (`lib/shipping/parcels.ts`) takes dimensions and tare weight from the box.
- Seed: create "Pillow box", "Bolster box" and "Accessory box" from `shipping_settings.packages`, and map them.

## Acceptance criteria

- [ ] Edit a box's dimensions and Save & sync, and the next test quote uses them.
- [ ] Changing a type's box with the "Used for" chip changes the parcels it quotes.
- [ ] A type with no box hides its live methods, and the Couriers card shows a warning.
- [ ] `sync.test.ts` confirms `box_for_type` is never sent to the provider.
- [ ] `parcels.test.ts` is updated.
- [ ] Nothing in `lib` or `app` reads `shipping_settings.packages`.

## Blocked by

- 01

Can run alongside 02 and 03.
