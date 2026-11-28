# 09: Mbolster parity — capsule dimensions, a physical cap replacing "no cap", compression feedback, end-on cross-section

Tracker: #209 · Parent: #200

**Type:** AFK
**Blocked by:** 03, 11 (the settle rule in one dimension)
**User stories:** 44, 45
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:storefront`, `area:admin`
**Status:** built (PR #213) — `bolsterStage` / true-scale `layoutBolsterPlacements`, `settleBolster` + `fitBolster` (tested), ring, gauge and refusal in `xray-bolster.tsx`, `BolsterCrossSection` (end-on) on `/mbolster-config`, Configure and Result, the save confirm on all three, ADR 0008 amended. The registry's bolster numbers are still the fallbacks: Ivan's measurements land in `BOLSTER_DIMENSIONS`.

**Amended 2026-11-28 (owner):** the end-on cross-section is removed from every Mbolster x-ray (`/mbolster-config`, Configure and Result) and `BolsterCrossSection` is deleted. The ring, gauge, refusal and save confirm stay. `xray-bolster.check.ts` and `surface-parity.check.ts` now assert it is absent.

## Goal

The bolster speaks the same fit language as the pillow: pouches to scale along the capsule, a fit status instead of an unbounded slot list, and a cut that shows the stack.

## The gap, precisely

- `layoutBolsterPlacements` packs any number of pieces in one line; "no cap in v1" is written into ADR 0008 and `validateBolsterPlacements`.
- `BOLSTER_CAPSULE_LENGTHS` (460 / 560 / 640 view units) and `BOLSTER_CAPSULE_HEIGHT` (180) are art constants, not millimetres.
- `xray-bolster.tsx` shares `MorphPiece`, `PieceLabel` and the conform pass with the pillow; the fit hooks in at the same points.

## Scope

- **Registry:** `BOLSTER_DIMENSIONS[length]` (from slice 01) drives the capsule: `k = capsuleViewLength / lengthMm` per length; the diameter sets the capsule height.
- **`fitBolster(placements, length, ctx)`** in `fit.ts`: Σ pouch widths along the capsule vs `lengthMm` (`ok` / `compressed` / `over`, pro rata squeeze); per piece, `thicknessMm` vs `diameterMm` (a pouch thicker than the bolster is `over`).
- **Layout:** *amended 26-9-2026 (Ivan):* the line of pouches fills the capsule — its length split by the settled, squeezed widths the fit says, its short axis the diameter — so the bolster reads fully stuffed; the fit alone says relaxed, compressed or over. Settle in one dimension: pouches spread into the capsule's empty ends by the volume rule, thinning toward the floor.
- **Feedback:** capsule ring (amber / red), a length gauge (`520 / 600 mm`), refusal on `over` through `addBolsterPiece`'s toast, the save-time confirm on `/mbolster-config`, Configure and **Result**.
- **Cross-section:** end-on (a circle of `diameterMm` with the stack inside) beside the capsule, using the slice 05 component with a `bolster` variant.
- **ADR 0008 amendment:** the Mbolster cap is physical and derived; no slot number is introduced. `validateBolsterPlacements` stays uncapped (fit is advisory, as for the pillow).

## Acceptance criteria

- [x] vitest: `fitBolster` returns `ok` / `compressed` / `over` for the three cases along the capsule and `over` for a pouch thicker than the diameter (and `compressed` when its floor fits); deterministic across input order (`bolster-fit.test.ts`).
- [x] A bolster pouch renders at `widthMm × k` and the short / medium / long capsules differ by their registry lengths and diameters (vitest; the numbers are the fallbacks until Ivan's measurements land); three pouches in a long capsule settle into the empty ends — the end pouches spread up to their capacity, the middle one keeps its width.
- [x] Adding a piece that cannot fit is refused with the fit message; a compressed capsule shows the amber ring and the gauge (self-check). *(Browser check for Ivan: wired, not yet seen on a deployed build.)*
- [x] The end-on cross-section is mounted on `/mbolster-config` (Staff and guest), Configure bolster cards and **Result** assign for bolsters; `xray-bolster.check.ts` and `surface-parity.check.ts` assert it (and the save confirm on all three).
- [x] ADR 0008 carries the amendment.
- [x] `./scripts/graphify update .` run and committed (from a cold cache).

## Build notes (2026-09-25)

- **Stage per length.** `bolsterStage(length)`: `k = capsule view length / lengthMm`, the height the registry diameter × k, so a long bolster draws thinner than a short one, as it is. `bolsterFrame`, `bolsterCapsulePath` and `bolsterShellPolygon` all read it; `BOLSTER_CAPSULE_HEIGHT` stays only as the old reference.
- **Settle in one dimension** (`settleBolster`): pouches packed edge to edge, centred; the first spreads into the front end and the last into the back end (a lone pouch into both), each up to `widthMm × (T / minT − 1)` or its flat width; nothing between two packed pouches is a void, so the middle pieces keep their width. Thickness follows by volume.
- **Fit** (`fitBolster`): Σ settled widths + 2 mm seams against the capsule length with the squeeze shared pro rata by `widthMm − minWidthMm`; each pouch's settled thickness against the diameter (`compressed` when its floor fits, `over` when not). `usedMm` is what the pack stands at. `bolsterFitMessage` names the length problem first, then the first pouch too thick.
- **Feedback** reuses the pillow vocabulary: the capsule path stroked amber / red, dashed pouches with `↕ / ↔` marks, a `used / length mm` gauge in the editor strip, refusal on the add's toast path. The confirm is `confirmSaveWithBolsterFit`, one native confirm.
- **End-on cross-section**: a circle of the diameter with the thickest pouch's slab inside (the one that decides whether the bolster closes), hatched when compressed, red when it cannot fit, with the length used under it. Lazy on the Admin pages like the pillow's.
- **Pre-existing check failure fixed on the way:** `xray-bolster.check.ts` asserted the mbolster page gate as `Boolean(staffCtx)`; the page gates on the results permission. The assertion now matches the page.
