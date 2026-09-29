# 10: Physical calibration sign-off — real builds against the x-ray, tune compression, device pass

Tracker: #210 · Parent: #200

**Type:** HITL
**Blocked by:** 01, 02, 03, 04, 05, 06, 07, 09, 11
**User stories:** 48
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** ready for sign-off (PR #213, 2026-09-25) — every AFK slice this waits on is built. What still draws from fallbacks: the pouch, Neck support and Mbolster dimensions (Ivan's numbers → `dimensions.ts` or Settings); the side-view SVG is not used by any slice yet.

## Why this cannot be AFK

The registry is typed by a person, the compression rule is a simplification, and the only oracle is a pillow on a bench. Tests prove the arithmetic; this proves the numbers.

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
- [ ] Guest preview on a phone: the cut is readable at 360 px wide.

**Device pass**
- [ ] In-store tablet (Safari) and an Android phone: gauges, drag (including the Layer sunburst) and cross-section all usable; no page scroll during a drag.

**Numbers**
- [ ] Every value changed during calibration is committed to `dimensions.ts` with the date, `PLACEHOLDER_DIMENSIONS` is false, and the outcome is posted as a comment on the PRD issue.

## Done when

Every box is ticked and the outcomes are posted on the PRD issue.
