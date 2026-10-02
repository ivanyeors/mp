# 10: Physical calibration sign-off — real builds against the x-ray, tune compression, device pass

Tracker: #210 · Parent: #200

**Type:** HITL
**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 09, 11
**User stories:** 48
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** ready for sign-off (PR #213, 2026-09-25) — every AFK slice this waits on is built. What still draws from fallbacks: the pouch, Neck support and Mbolster dimensions (Ivan's numbers → `dimensions.ts` or Settings); the side-view SVG is not used by any slice yet.

## Why this cannot be AFK

The registry is typed by a person, the compression rule is a simplification, and the only oracle is a pillow on a bench. Tests prove the arithmetic; this proves the numbers.

## Calibration sheet (built 2-10-2026)

**Settings → Products → Product Visualize → Dimensions → "Open the calibration sheet"** (`/settings/products/calibration`, `page-builder` permission). It lists the x-ray's prediction for every bench check below with an empty column for the ruler reading, and prints on its own (A4 landscape; the Settings shell is hidden in print). It reads Settings on every load, so print it once the Size M measurements are in; until then a red banner names every entry still on a fallback size. The numbers come from `calibrationSheet` (`lib/spatial-fillings/calibration.ts`, tested), which calls the same fit, settle and Size scaling the x-ray draws with.

- Loft budget per Size (side / centre).
- The default Filling Templates for S, M and L (every tier with a default): loft at each Section's middle against its max.
- Layers until it cannot close: per pouch, per Size, side and centre, filled front-to-back, first Layer that squeezes / that cannot close.
- Five 6D L in one Section (side by side and stacked), with the x-ray's message.
- Settle: one pouch alone in centre middle of an M (spread each way, length and thickness relaxed → settled), and where two 6D L meet with the middle empty.
- Footprints of every pouch and Neck support at every Size.

## Software checks run 2-10-2026 (Chromium phone emulation, not a real device)

- Touch drag of a pouch across Sections at 360 and 390 px: moves, page never scrolls during the drag.
- Touch drop on a stacked cell: the Layer sunburst opens (wedges ≥ 44 px, measured 86), a tap on a wedge moves the pouch to that Layer, no scroll.
- Cross-section at 360 px: **failed, then fixed.** The 664-unit drawing scaled to ~330 px drew the "max … mm" labels at 4–5 px. Phones now draw a 380-unit view with larger type (smallest label ~13 px on screen at 360 px, the status on its own line); desktop is unchanged (`xray-cross-section.test.tsx` pins both, the bolster cut too).
- Still for a person: Safari on the in-store tablet and a real Android phone.

## Checklist

**Loft (slice 03 / 04)**
- [ ] Build S, M and L from their authored default **Filling Templates**. Measure loft at each **Section**'s middle with a ruler. Record beside the x-ray's per-section mm from the Across cut.
- [ ] For each, add layers until the pillow visibly cannot close. Record the layer at which the x-ray turned red versus the layer at which the bench said no. Adjust `minThicknessMm` per filling, or the compression rule, until they agree within one layer.
- [ ] Squeeze five 6D L into one Section by hand. Confirm the x-ray shows `over` and the message's numbers are credible.

**Settle (slice 11)**
- [ ] Put one 6D L in the center middle of an open Size M and leave the back empty; close the pillow, press once as a head would, open it, photograph from above. Compare how far it spread and how much thinner it reads to the settled render. Adjust the spread rule or the pouch's `flatLengthMm` until the render agrees.
- [ ] Front and back filled, middle empty: confirm the two pouches meet near where the render puts the seam.

**Scale (slice 02)**
- [ ] Lay one 6D L in an open Size M chamber; photograph from above; compare the footprint to the x-ray's. Repeat for 3D S in XS and 6D+ (Folded) in XL. *(Since PR #215 the entered sizes are the Size M piece and XS / XL scale from M by the pillow's proportions, so the XS and XL photos test that scaling rule too.)*
- [ ] Neck support L in a premium L: footprint across the Section matches.

**Moves (slice 06 / 07)**
- [ ] A Staff member who has not read the PR moves a pouch to the other Section, into another Layer (the drop's Layer sunburst), to the outside of its row and within its cell's free space, by drag and by keyboard, on a desktop and on a phone, without instruction. Note anything they had to be told. *(The move pad was retired 27-9-2026; the drag carries every move.)*
- [ ] Slice 08 was built ahead of this sign-off (Ivan, 28-9-2026). Check it instead: nudge a small pouch to the outer edge on the x-ray, build it, and confirm the photo matches — including where the gap sits when it cannot fill an empty neighbouring compartment.

**Cross-section (slice 05)**
- [ ] The build team reads the Across cut for a side-sleep build and describes what they will assemble; compare to what the x-ray author intended.
- [ ] Guest preview on a phone: the cut is readable at 360 px wide. *(Passes in Chromium phone emulation since 2-10-2026; confirm on a real phone.)*

**Device pass**
- [ ] In-store tablet (Safari) and an Android phone: gauges, drag (including the Layer sunburst) and cross-section all usable; no page scroll during a drag.

**Numbers**
- [ ] Every value changed during calibration is committed to `dimensions.ts` with the date, `PLACEHOLDER_DIMENSIONS` is false, and the outcome is posted as a comment on the PRD issue.

## Done when

Every box is ticked and the outcomes are posted on the PRD issue.
