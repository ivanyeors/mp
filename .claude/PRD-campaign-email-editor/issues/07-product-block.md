# 07 — Product block: up to three Listed products, priced from Costings at send

**Issue:** [#361](https://github.com/ivanyeors/mp/issues/361) · **Parent:** [#354](https://github.com/ivanyeors/mp/issues/354)
**Type:** AFK
**Status:** done
**Blocked by:** 05 (email image renditions), 06 (the column primitive for *side by side*)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:email`

## Goal

The owner adds **Products** to a campaign, picks the FibreCool cover and the Cervical Neck
Support, and the email shows each with its photo, name, *from* price and a *Shop now* button
that opens its shop page. The price is never typed: it is whatever the shop charges when the
email is sent (PRD decision 3).

## What to build

- An `EmailBlock` of type `products`: 1–3 product ids, a layout (*one per row* or *side by side*,
  which stacks on a phone), and a button label (default *Shop now*). The block stores **ids
  only**; no name, image or price is copied into the campaign.
- **The picker**: a searchable list of **Listed** storefront products (`products.status =
  'active'` with an active Variant, `getProducts`' shop catalog: Composed sellables are bought
  through the configurator, not the shop, so they are not offered here; a button's *Customise
  your Mpillow* target covers them).
- **At render** (preview, test and every send), the renderer reads each product through the same
  query the shop uses, and shows:
  - its first image, as an email rendition (slice 05);
  - its title;
  - its price: the lowest active Variant's price, *"from S$39"* when it has more than one active
    Variant, the compare-at price struck through only when the shop shows one: the shop card's
    own rule (`shopCardPrice`, which the card uses too). These come from the
    Storefront product, which Costings sets (ADR 0001): the email never holds a price of its own;
  - a button to its shop page, with the campaign's UTM parameters.
- **Readiness**: a check that every product in the campaign is still Listed. An unlisted or
  deleted product fails the check by name (*"Cervical Neck Support is no longer in the shop:
  remove it or list it again"*), so no wave sends a dead link. It runs before each wave, since
  a campaign's waves can span days.
- The lock: a started campaign's product *choice* is fixed with the rest of its content; its
  prices and photos follow the shop, as an order email's data follows the order (the Email
  template rule: words fixed, data from the platform).

## Acceptance criteria

- [ ] A product block renders the same price the shop page shows for that product, at that moment.
- [ ] Changing a price in Costings changes the next preview and the next wave; no campaign row
  changes.
- [ ] Un-listing a product makes the campaign's checks fail by name, and the wave cannot start.
- [ ] Side by side becomes one per row below 480px, including in Gmail on Android.
- [ ] Links carry `utm_source=email_campaign&utm_medium=email&utm_campaign=<name>`.
- [ ] The product card is readable in light and dark with no setting: its price, name and button
  follow the shell's dark list (slice 15), and a cut-out product photo sits on slice 05's light
  plate.

## Verify

```bash
npx vitest run lib/email lib/email-campaigns "app/[lang]/settings/campaigns"
```

Renderer tests with fixture products (one Variant, several, a compare-at price, unlisted), and
a readiness test for the unlisted product.
