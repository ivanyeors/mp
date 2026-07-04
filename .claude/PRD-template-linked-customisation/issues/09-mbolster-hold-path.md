# Slice 09 — Mbolster hold path (mbolster-config)

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 4, 5, 6, 7, 8, 43

## What to build

Same authorize → assign → accept pipeline for bolsters via mbolster-config.

- mbolster-config collects bolster preferences, cover/case prefs as applicable, add-ons, address, shipping.
- No customer filling or protector picking.
- Hold uses composed sellable **length** MSRP (short/medium/long), not tier.
- Operator assign: confirm/override length + Filling Template filtered to bolster + size/length key.
- Reuse Result lifecycle, authorization-hold, status page (guest + account), and Order creation from slices 05–07.
- **mp-maker is unchanged** (no bolster hold wiring via mp-maker).

## Acceptance criteria

- [ ] Completing mbolster-config purchase path creates a held bolster Result and Stripe authorization including prefs/add-ons + shipping + tax.
- [ ] Result stores cover/case preferences and add-ons; no customer filling/protector controls.
- [ ] Operator assigns length (confirm or override) + bolster Filling Template filtered by type and length/size key.
- [ ] Customer Accept captures and creates an Order with bolster build snapshot; Decline releases hold and offers restart into mbolster-config.
- [ ] Shop still does not sell mbolster via plain Add to Cart (slice 03).
- [ ] mp-maker routes and behavior remain unchanged.

## Blocked by

- Slice 07 (full accept/capture path proven on pillow)
