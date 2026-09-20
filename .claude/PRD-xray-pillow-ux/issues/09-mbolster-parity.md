# 09: Mbolster parity — capsule dimensions, a physical cap replacing "no cap", compression feedback, end-on cross-section

Tracker: #209 · Parent: #200

**Type:** AFK
**Blocked by:** 03
**User stories:** 44, 45
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:storefront`, `area:admin`

## Goal

The bolster speaks the same fit language as the pillow: pouches to scale along the capsule, a fit status instead of an unbounded slot list, and a cut that shows the stack.

## The gap, precisely

- `layoutBolsterPlacements` packs any number of pieces in one line; "no cap in v1" is written into ADR 0008 and `validateBolsterPlacements`.
- `BOLSTER_CAPSULE_LENGTHS` (460 / 560 / 640 view units) and `BOLSTER_CAPSULE_HEIGHT` (180) are art constants, not millimetres.
- `xray-bolster.tsx` shares `MorphPiece`, `PieceLabel` and the conform pass with the pillow; the fit hooks in at the same points.

## Scope

- **Registry:** `BOLSTER_DIMENSIONS[length]` (from slice 01) drives the capsule: `k = capsuleViewLength / lengthMm` per length; the diameter sets the capsule height.
- **`fitBolster(placements, length, ctx)`** in `fit.ts`: Σ pouch widths along the capsule vs `lengthMm` (`ok` / `compressed` / `over`, pro rata squeeze); per piece, `thicknessMm` vs `diameterMm` (a pouch thicker than the bolster is `over`).
- **Layout:** footprint-true along the capsule, centred as a group; compression from the fit.
- **Feedback:** capsule ring (amber / red), a length gauge (`520 / 600 mm`), refusal on `over` through `addBolsterPiece`'s toast, the save-time confirm on `/mbolster-config`, Configure and **Result**.
- **Cross-section:** end-on (a circle of `diameterMm` with the stack inside) beside the capsule, using the slice 05 component with a `bolster` variant.
- **ADR 0008 amendment:** the Mbolster cap is physical and derived; no slot number is introduced. `validateBolsterPlacements` stays uncapped (fit is advisory, as for the pillow).

## Acceptance criteria

- [ ] vitest: `fitBolster` returns `ok` / `compressed` / `over` for the three cases along the capsule and `over` for a pouch thicker than the diameter; deterministic across input order.
- [ ] A bolster pouch renders at `widthMm × k` and the short / medium / long capsules differ by their measured lengths.
- [ ] Adding a piece that cannot fit is refused with the fit message; a compressed capsule shows the amber ring and the gauge.
- [ ] The end-on cross-section is mounted on `/mbolster-config` (Staff and guest), Configure bolster cards and **Result** assign for bolsters; `xray-bolster.check.ts` and `surface-parity.check.ts` assert it.
- [ ] ADR 0008 carries the amendment.
- [ ] `./scripts/graphify update .` run and committed.
