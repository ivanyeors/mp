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

- [x] Completing mbolster-config purchase path creates a held bolster Result and Stripe authorization including prefs/add-ons + shipping + tax.
- [x] Result stores cover/case preferences and add-ons; no customer filling/protector controls.
- [x] Operator assigns length (confirm or override) + bolster Filling Template filtered by type and length/size key.
- [x] Customer Accept captures and creates an Order with bolster build snapshot; Decline releases hold and offers restart into mbolster-config.
- [x] Shop still does not sell mbolster via plain Add to Cart (slice 03).
- [x] mp-maker routes and behavior remain unchanged.

## Status

**Done** on `cursor/mbolster-hold-path`.

- `lib/results/composed-sellable` — pillow size×tier and bolster length BOM + Costings MSRP
- `POST /api/results/hold` — `productType: bolster` + `suggestedLength` (short/medium/long)
- Assign + `loadAssignedBuild` price bolster holds and assemble from `bolster_bom_lines`
- mbolster-config: authorize-then-capture purchase path (no cart, no customer fillings)
- Operator assign UI: length select (short/medium/long) + bolster Filling Templates
- Tests: `lib/results/__tests__/composed-sellable.test.ts`

## Blocked by

- Slice 07 (full accept/capture path proven on pillow)
