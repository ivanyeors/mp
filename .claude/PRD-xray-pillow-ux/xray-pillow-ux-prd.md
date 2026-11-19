# PRD: X-ray pillow UX — true scale, physical fit, cross-section, granular moves

Status: Draft (needs-triage)
Tracker: #200 (slices #201–#210, #212 and #214, `issues/`)
Source: Ivan's brief (2026-09-20) + a code audit of the x-ray subsystem at `main` @ `d745e83`
ADRs: `docs/adr/0008-spatial-filling-placements.md` (**Placement** rows are the "where" truth; pack list derived), `docs/adr/0009-xray-filling-visuals.md` (x-ray guardrails: no box cropping, legible piece count, deterministic layout, prepared morphs, one asset pipeline). Slice 01 adds **ADR 0019** (physical fit model: measurements in code, fit derived on read, never persisted; 0019 was the next free number at drafting, so take the next free one when the slice lands).
Glossary: `CONTEXT.md` — **Placement**, **Section**, **sub-section**, **cell**, **Layer**, **Insert order**, **X-ray editor**, **Filling visual**, **Neck support**, **Staff assist mode**, **Filling Template**, **Size membership**, **Result**, **Composed sellable**, **Product Visualize**
Decisions taken before drafting: (a) every measurement lives in code, in millimetres — Ivan's brief says "embedded in our code base", and ADR 0009 already splits shape (code) from colour (DB) the same way; *amended 25-9-2026:* pillow geometry (outlines, section widths, gusset heights, from the 2018 drawings) stays code-only, while filling pouch and **Neck support** dimensions and the loft allowance ship as code defaults and are editable in Settings (slice 12), the same code-default / database-override split ADR 0009 uses for colour; (b) fit and compression are **derived** from **Placements** plus the registry on every read and never stored, exactly like the **Spatially authored** status; (c) the x-ray stays one component on three surfaces — nothing forks; (d) no physics engine, no WebGL, no soft-body simulation (ADR 0009 still stands) — *amended 18-10-2026:* the cross-section's drawing is now a soft-body settle, display only (ADR 0025, PRD `xray-soft-cut`); the fit stays arithmetic; (e) the only schema change in the whole PRD is the optional fine-nudge pair of columns in slice 08, and that slice is gated on evidence from the discrete-move slices; (f) **natural settle** (Ivan, 2026-09-21) is a display-and-fit pass over the authored **Placements** — fill spreads into an empty neighbouring **sub-section** on screen and in the loft arithmetic, but nothing ever rewrites which **cell** a pouch was put in.

## Problem Statement

The **X-ray editor** shows *where* each pouch goes. It does not show *whether it fits*, and it does not show *how big it is*.

Today a single 6D L pouch dropped into a cell is drawn stretched to fill the whole cell. Add a second and both shrink to half. Add five and each is a fifth. The layout engine is a space partition: pieces "always fill their tract" (`lib/spatial-fillings/xray-layout.ts`), and the only size signal is a five-step relative weight per **Item** size (`XS 0.7 … XL 1.3` in `visuals.ts`) that widens or narrows a piece's share of the row. Nothing in the pipeline knows that a 6D L is 180 mm wide, that a Size M pillow's chamber is 150 mm across, or that five of them cannot lie side by side. The pillow silhouette is one path at every **Size**, so an XS and an XL render identically, and a pouch that would overflow an XS chamber looks exactly as comfortable as it does in an XL.

Depth is faked. A stacked cell shifts each **Layer** down and right by a fixed 7 × 14 view units and darkens it, whatever the pouches are. Five **Layers** of 6D+ (Folded), the thickest filling we sell, draw the same as five **Layers** of 3D (S). There is no notion of loft — the pillow's maximum height — so there is no notion of a stack that cannot close. The caps that exist (five pieces per **Layer**, five **Layers**, twenty-five per **cell**) are database ceilings chosen for the schema, not for any pillow. Staff can build, save and hold a mix that no build team can assemble, and the only person who finds out is the one holding the pouches at the bench.

Moving a pouch is remove-and-add. The editor can add a piece to a **cell** (radial picker), remove one (chip), reorder whole **Layers** (drag rows), flip a cell between side-by-side and stacked, and mirror a **Section**. It cannot move one pouch to the next **cell**, to the next **Layer**, or to the other end of its row. There is no selection, no keyboard, no nudge. An in-store fitting where the customer says "the firmer one to the outside" is two gestures and a picker traversal instead of one.

A **cell** is also a box. A pouch is conformed to its authored **cell** ∩ silhouette and stops dead at the **sub-section** divider, so a center **Section** with the middle filled and the back empty draws a pouch and, behind it, a void. No built pillow has that void: a **Section** is one chamber, the **sub-sections** are only positions along it, and fill slumps into empty space the moment the pouch is pushed in. The render shows a hole the product does not have, and the loft arithmetic of this PRD would judge the middle as if the back were not there to spill into.

And the x-ray is top-down only. The question every side sleeper asks — *are the sides higher than the middle?* — is the one view the product cannot draw. A stacked cell's depth is implied by an offset and a scrim; the shopper reading the completed preview cannot see loft at all.

Ivan has the measurements: the filling pouches, the pillow sizes, and the Cervical **Neck support** sizes. This PRD is what the product does with them.

## Audit: what the x-ray does today

Measured against `main` @ `d745e83`. File references are the drop-in points for the slices.

| Area | Today | Gap against the brief |
|---|---|---|
| Piece size | Relative weight per **Item** size, five steps (`visuals.ts` `SIZE_SCALES`); pieces fill their tract, so absolute size is a function of how many share the row | No physical size; one pouch in a cell is drawn as big as the cell; adding pieces shrinks all of them without limit |
| Pillow size | One silhouette path (`xray-assets.ts` `SILHOUETTE_PATH`, 664 × 374) at every **Size**; cell grid is equal thirds (`COL_X` / `ROW_Y`) | XS and XL render identically; nothing converts millimetres to view units |
| Depth / loft | `packDepthStack`: fixed 7 × 14 view-unit shift per **Layer** + a scrim of 0.14 per depth (max 0.5) | Loft is not modelled; a stack never "does not fit"; thickness per filling is unknown |
| Compression | `pouchOutline` rounds corners as the aspect ratio grows (cosmetic); no compression limits | No minimum thickness, no minimum width, no error state |
| Caps | 5 per **Layer**, 5 **Layers**, 25 per **cell** (`core.ts`); DB checks mirror them | Schema ceilings, not physical ones; the real limit (does it fit) is unenforced |
| Empty sub-sections | A pouch is conformed to its authored cell ∩ silhouette (`CELL_CLIP_PATHS`, `conformPouchPath` against the cell polygon); an empty neighbouring sub-section renders as a void | Real fill slumps into the void within the chamber; the render shows a hole no built pillow has, and any loft arithmetic on authored cells alone judges a stack without the room it would spill into |
| Add | Click the dived cell → radial picker → `addPiece` (lowest free slot, topmost **Layer** with room) | Fine as is |
| Remove | Chip on the pouch group / layer row / pack list (`removePiece`, `removeLayer`, `removeFilling`) | Fine as is |
| Reorder | Drag **Layer** rows (`moveLayer`, dnd-kit); Side / Stacked toggle (`setCellArrangement`); Mirror with Undo | Whole-**Layer** only. No per-piece move between **cells**, between **Layers**, or within a **Layer**; no selection; no keyboard; no nudge |
| Cross-section | None | The "sides vs center" question cannot be answered visually |
| Neck support | `pill` shape, never fatter than 2.2 : 1 of its tract, stretched to the tract | No measured footprint |
| Mbolster | Single line pack along the capsule, **no cap** (`layoutBolsterPlacements`) | Unbounded; no fit |
| Surfaces | `XrayPillow` on the configurator (Staff editable / guest read-only), Configure card page and **Result** assign via `XrayEditor`; rules-engine preview read-only | All three already receive the pillow **Size** from their host — nothing new to fetch |
| Performance | Geometry chain memoised on `[placements, itemSizes]`; conform pass ~7 ms at 11 pieces, ~10 ms at 17 | Any fit model must join that memo, not add a second one |
| Tests | `xray-layout.test.ts` (determinism, packing, seams, depth), `xray-pillow-geometry.test.ts`, `xray-pillow.check.ts`, `xray-dive.check.ts`, `xray-bolster.check.ts`, `surface-parity.check.ts`, `api-contract.check.ts` | Good prior art; every new module gets the same treatment |
| Data | `items.size` (XS–XL), type descriptor from `subtype` / `name` (`"6D (L)"`, `"6D Fold"`, `"6D+ (Folded)"`, `"3D (S)"`, `"6D (Round)"`); `pillow_products.size` XS–XL; Mbolster short / medium / long | No dimension columns anywhere, and none wanted (decision a) |

## Solution

From a **Staff** perspective: the x-ray becomes honest. A pouch is drawn at its real size for the pillow **Size** on screen, so one pouch in a cell is one pouch with room around it, and five 6D L across a **Section** visibly do not fit. Stacked **Layers** compress — down to each pouch's minimum thickness and no further — against the pillow's maximum loft, and a cell that has hit that limit is outlined amber; one that cannot close even fully compressed is outlined red, with a message that names the numbers. Leave a **sub-section** empty and the fill beside it settles into the space the way it does in the chamber: the pouch spreads along the **Section**, thins in proportion, and the void disappears — on screen and in the loft arithmetic — while the **cell** it was put in stays exactly where it was authored. A live cross-section beside the pillow shows the three **Sections** as stacks against the loft line, so "sides higher than center" is a glance, not an inference. Any pouch can be selected and moved: to the next **cell**, up or down a **Layer**, along its row — by keyboard, by an on-canvas pad, or by dragging it — with Undo. Same component, same gestures, on the configurator, in Configure and on **Result** assign.

From a shopper perspective: the read-only preview x-ray draws the recommended mix at true scale, and the cross-section beside it shows the build's profile. Nothing becomes editable.

From a developer perspective: two new pure modules and one changed one. A **dimension registry** (millimetres, keyed by pillow **Size**, filling type × size, **Neck support** size, Mbolster length) and a **fit model** that turns **Placements** plus the registry into per-**Layer** width fit, per-**cell** loft fit, compression ratios and a status. The layout engine reads footprints and compression from the fit instead of partitioning space; the renderer, the gauges and the cross-section all read one memoised fit result. Moves are pure functions beside `addPiece` and `moveLayer`. No schema change until slice 08, and that one is optional.

What ships, numbered by slice (the build order, which puts 11 between 3 and 4, is in Further Notes):

1. The dimension registry in code, with Ivan's measurements as the defaults; glossary entries and ADR 0019; a read-only Dimensions column in **Product Visualize** so an unmeasured filling is visible.
2. True-scale rendering: the layout engine draws pouches at their footprint relative to the pillow **Size**, on every surface.
3. The fit model: width budgets per **Layer**, loft budgets per **cell**, compression limits, fit status.
4. Compression feedback and error handling in the editor: status rings, loft gauge, refused adds, save-time confirm, phone dock parity, fit per member **Size** on shared templates.
5. The cross-section view, across and along, live, on all three surfaces and the shopper preview.
6. Per-piece moves: selection, keyboard and move pad, between **cells**, **Layers** and positions, with Undo.
7. Pointer and touch drag of a pouch onto another **cell** or **Layer**.
8. *(optional, gated)* Fine nudge in millimetre steps, persisted as visual-only columns.
9. Mbolster parity: capsule dimensions, a physical cap, compression feedback, end-on cross-section.
10. Physical calibration sign-off against real builds.
11. Natural settle: a pure pass between layout and fit that spreads a pouch into an empty neighbouring **sub-section** of the same **Section** and **Layer**, thinning it by volume; the settled view is the default everywhere, the dived **Section** shows authored cells with a settled ghost, and leaving the dive morphs one into the other.
12. Dimension settings: the loft allowance, the filling pouch dimensions per size and the **Neck support** dimensions editable in Settings → Products → Product Visualize, as database overrides of the code defaults (row wins, Reset restores the default); pillow geometry stays in code.

## User Stories

### Product scale

1. As **Staff**, I want each pouch drawn at its real size relative to the pillow, so that one pouch in a **cell** looks like one pouch and not a pouch stretched to the cell's edges.
2. As **Staff**, I want the pillow's **Size** (XS–XL) to set the scale, so that the same 6D L pouch takes up more of an XS pillow than of an XL.
3. As **Staff**, I want a Cervical **Neck support** drawn at its measured length and width, so that its footprint across a **Section** is honest.
4. As a shopper, I want the read-only preview x-ray at the same true scale, so that what I see is proportionate to what I get.
5. As a developer, I want every measurement in one code registry in millimetres, so that there is one place to correct a number and no second copy inside a component.
6. As **Staff**, I want to see in **Product Visualize** which filling **Items** have no measurement yet, so that a pouch drawn at a fallback size is never mistaken for a measured one.
7. As a developer, I want a filling with no measurement to render at a documented family default instead of failing, so that a new inventory **Item** never blanks the x-ray.

### Fit and compression

8. As **Staff**, I want stacked **Layers** to compress only down to each pouch's minimum thickness, so that the x-ray stops pretending five **Layers** fit in any pillow.
9. As **Staff**, I want side-by-side pouches to squeeze only down to their minimum width, so that five 6D L across one **Section** is shown as the overflow it is.
10. As **Staff**, I want a **cell**'s stack compared against the pillow's maximum loft for its **Size**, so that "can this pillow close?" has one answer.
11. As **Staff**, I want compression shared across the **Layers** of a stack by a fixed, explainable rule, so that the same mix always compresses the same way (ADR 0009 guardrail 3).
12. As **Staff**, I want a compressed pouch to look compressed in the top-down x-ray, so that I can tell a relaxed **cell** from a squeezed one at a glance.
13. As a developer, I want the fit computed once per **Placements** change and shared by the x-ray, the gauges and the cross-section, so that a re-render never computes it three times.

### Error handling

14. As **Staff**, I want a **cell** compressed to its limit outlined in amber and a **cell** that cannot fit outlined in red, so that the problem is visible on the pillow itself.
15. As **Staff**, I want a loft gauge for the dived **cell** showing used and maximum in millimetres, so that I can see how much room is left before I add.
16. As **Staff**, I want an add that would make a **cell** impossible refused with a message naming the numbers (needed, fully compressed, maximum), so that I know what to remove instead of guessing.
17. As **Staff**, I want an add that merely compresses a **cell** allowed, so that compression is a working state and not an error.
18. As **Staff**, I want a loaded template or a **Size** change that no longer fits flagged on the affected **cells** and in a banner, so that a Size XS pillow loaded with a Size L mix is caught before the hold.
19. As **Staff**, I want to confirm a save or a hold that carries an impossible **cell** rather than be blocked, so that an edge case with a real-world workaround is not a dead end (advisory, like the **Spatially authored** warning).
20. As **Staff** authoring a template shared across **Sizes**, I want fit shown per member **Size**, so that a recipe that fits M and not XS says so before I save it for both.
21. As **Staff** on a phone, I want the same feedback in the dock, so that in-store fittings are not blind to it.
22. As a developer, I want the existing caps (5 per **Layer**, 5 **Layers**, 25 per **cell**) kept as hard ceilings behind the fit model, so that the database constraints and the validator do not change.

### Cross-section

23. As **Staff**, I want a live cross-section across the pillow (left, center, right) showing each **Section**'s stack against the maximum loft, so that a side-sleep build reads as "sides higher than center" at a glance.
24. As **Staff**, I want to pick which **sub-section** the cut runs through (front, middle, back), so that I can inspect the neck edge as well as the middle.
25. As **Staff**, I want a cut along the dived **Section** (front to back), so that the head-to-neck profile of one side is visible.
26. As **Staff**, I want compressed **Layers** hatched and impossible ones drawn above the loft line in red, so that the cross-section speaks the same fit language as the x-ray.
27. As a shopper, I want the cross-section beside my read-only preview, so that I understand the build I am paying for.
28. As **Staff**, I want the cross-section to update as I add, remove or move pieces, with no extra click, so that it is a view and not a report.
29. As **Staff**, I want the cross-section beside the pack list in Configure and on **Result** assign, so that authoring and assigning see it too.
30. As a developer, I want the cross-section derived from the same fit result as the x-ray, so that the two views can never disagree.

### Moving pieces

31. As **Staff**, I want to select a pouch on the x-ray, so that moves act on one clearly indicated piece.
32. As **Staff**, I want to move the selected pouch to the neighbouring **cell** (front or back, left or right **Section**) with arrow keys or an on-canvas pad, so that fixing a placement is not remove-and-add.
33. As **Staff**, I want to move the selected pouch one **Layer** up or down, so that depth is editable per piece and not only by dragging whole **Layer** rows.
34. As **Staff**, I want to reorder pouches within a **Layer** (left, right), so that "the firmer one on the outside" can be said in the x-ray.
35. As **Staff**, I want a move that would not fit refused with the same message as an add, so that moving cannot create what adding refuses.
36. As **Staff**, I want Undo on a move, so that a wrong keystroke is one tap to reverse (the Mirror pattern).
37. As **Staff**, I want to drag a pouch with the pointer or a finger and drop it on another **cell** or **Layer**, so that the manipulation matches how the physical build is done.
38. As **Staff** on a phone, I want the move pad in the dock, so that touch gets every move the keyboard gets.
39. As a developer, I want every move to be a pure function over **Placements** with tests, so that the renderer stays a thin view.
40. As **Staff**, I want a moved pouch to keep its **Insert order** when it stays in its **Section** and lose it when it leaves, so that the assembly sequence never names a pouch that is no longer there.

### Fine nudge (optional, gated)

41. As **Staff**, I want to nudge a selected pouch in millimetre steps within its **cell**, so that "pushed to the outer edge" can be recorded.
42. As **Staff**, I want the nudge to stop at the shell and the **cell** boundary, so that a pouch can never leave its **cell** or cross the seam.
43. As a developer, I want nudges stored as visual-only columns, excluded from the fingerprint and the pack list like `row_index`, so that **Promote** grouping and COGS never change because a pouch moved 5 mm.

### Mbolster

44. As **Staff**, I want Mbolster pouches drawn to scale along the capsule with a physical cap replacing "no cap", so that a bolster mix that cannot fit is shown as such.
45. As **Staff**, I want the same compression feedback and an end-on cross-section for Mbolster, so that both products speak one fit language.

### Safety and regressions

46. As a developer, I want the layout to stay deterministic and the renderer free of rect crops, so that ADR 0009 holds after the change.
47. As a developer, I want the read-only x-ray to gain no edit affordance, so that shoppers still cannot edit.
48. As **Staff**, I want a physical calibration pass on real builds, so that the numbers in code are trusted rather than typed.
49. As a developer, I want the committed knowledge graph refreshed in the same commit as the code, so that the freshness check passes.

### Natural settle (display physics)

50. As **Staff**, I want a pouch whose neighbouring **sub-section** is empty drawn spreading into that space, so that the x-ray shows the slumped fill a real pillow has instead of a void no real pillow has.
51. As **Staff**, I want a pouch to spread only within its own **Section** and **Layer**, so that the chamber walls stay walls.
52. As **Staff**, I want a pouch that spreads to thin in proportion to how far it spreads, never below its minimum thickness, so that the cross-section shows the loft I would actually feel.
53. As **Staff**, I want the settled view to be what I see after I leave the dive or save, and the authored **cells** to be what I see while I am editing a **Section**, so that editing stays precise and the result stays natural.
54. As **Staff**, I want a faint outline of where a pouch will settle while I am still editing, so that the effect of adding or moving a piece is visible live, before I leave the dive.
55. As **Staff**, I want the change from authored to settled animated when I leave the dive, so that I can see which pouch moved where.
56. As **Staff**, I want two pouches that spread into the same gap to meet at a seam and stay two pouches, so that the piece count stays legible (ADR 0009 guardrail 2).
57. As **Staff**, I want my moves and nudges to act on the authored **cells** with settle re-derived afterwards, so that free-form adjustment and natural display never fight.
58. As **Staff**, I want a nudge to decide where a pouch sits when it cannot fill the whole void, so that the fine adjustment still means something in the settled view.
59. As **Staff**, I want the fit, the gauges and the cross-section computed on the settled geometry, so that a stack that spills into an empty back is judged the way it will actually lie.
60. As a shopper, I want the preview x-ray settled, so that the pillow I see is the pillow I get.
61. As a developer, I want settle to be a pure display-and-fit pass that writes nothing to **Placements**, so that the pack list, the fingerprint and the authored recipe are untouched.
62. As **Staff**, I want a product with physical **sub-section** dividers to keep its pouches in their **cells**, so that settle is a fact recorded about the product and not a global assumption.
63. As **Staff**, I want to set the loft allowance as a percentage in Settings, default 10, so that the side view and the fit budget follow how much the cloth gives without a deploy.
64. As **Staff**, I want to enter each filling pouch's dimensions per size in Settings, so that a re-measured or new pouch is drawn and budgeted correctly without a code change.
65. As **Staff**, I want to enter the **Neck support** dimensions per size the same way, so that the accessory is budgeted like a pouch.
66. As **Staff**, I want to reset any entry to the shipped default and see whether it is a default, configured or unmeasured, so that a fallback pouch is never mistaken for a measured one.

## Implementation Decisions

### Units and scale

- **Millimetres everywhere in the registry.** View units are derived, never authored. One factor per pillow **Size**: `k = XRAY_VIEW.width / pillowWidthMm(size)`. The silhouette keeps filling the stage at every **Size** — the three surfaces have a fixed stage, and what matters for fit is the pouch-to-pillow proportion, not an absolute XS-next-to-XL comparison. `ponytail:` an absolute-scale toggle is one multiplier away if art direction ever wants it.
- **Section widths** come from the protector's divider seams, per **Size** (`sectionWidthsMm`: XS 204 / 195 / 204, S 203 / 240 / 203, M 223 / 260 / 223, L 251 / 260 / 251, XL equal thirds; Further Notes). The cell grid derives from them and replaces today's equal-thirds `COL_X`. The silhouette becomes per-**Size**: one master outline (the traced M bottom panel, `reference/silhouette-master.json`), scaled to the **Size**'s `widthMm` × `lengthMm` and then by `k`, replaces the fixed placeholder path — the M shape for every **Size**, no tab (decision 7) — and the nine cell polygons are cut from it (across at the section widths, **sub-sections** front-to-back with *front* on the notched side). The side view is Ivan's side SVG with its height set from `gusset` × (1 + `LOFT_ALLOWANCE`). The neck line is never drawn.
- **Pouch orientation** (long axis across the **Section** or along front-to-back) is a registry property per filling, default across. Data, not code, so a folded pouch that lies the other way is a row edit.

### New deep module — `lib/spatial-fillings/dimensions.ts`

Pure, browser-safe. The whole registry and the whole lookup:

- `PILLOW_DIMENSIONS[size]`: width, length, max loft per **Section**, section widths (all mm; the section widths are the protector's divider seams, `reference/protector-sections.json`). `lengthMm` is the body length at the lobe line (306 / 330 / 330 / 350 / 365), never the tab. Also: `SILHOUETTE_MASTER` (the traced M bottom panel in mm, from `reference/silhouette-master.json`) and per **Size** `outline` = the master scaled to `widthMm` × `lengthMm` (`reference/silhouette-<size>.json` holds the result for checking; the traced panels stay in `case-outline-*` and `protector-outline-*` as source data) and `gusset` (full height, tab-end height, taper run, centre-back height, dip run; the protector is the same height with no dip). `LOFT_ALLOWANCE = 0.10` is one exported constant: `maxLoftMm` is per **Section**, `[gusset.fullMm, gusset.backMm, gusset.fullMm] × (1 + allowance)` — the centre **Section** is one inch lower than the sides (Sizes spreadsheet: side 4''–8'', centre 3''–7'') — for the side view and for fit alike.
- `POUCH_DIMENSIONS[key]`: width, length, relaxed thickness, fully-compressed thickness, minimum width, orientation. Key = filling family + variant or size, derived from the same `fillingDescriptor` the picker and the colours already use (`"6D (L)"` and `"6D L"` and `"6D Fold" + size L` all resolve to `6d/l`). Aliases are one table (`fold` → `folded`).
- `NECK_SUPPORT_DIMENSIONS[size]` (XS–L) and `BOLSTER_DIMENSIONS[length]` (short / medium / long: length, diameter).
- Optional per pouch: `flatLengthMm` / `flatWidthMm`, the fabric's own limit when it stops a spread before the fill reaches its fully compressed thickness. Absent, the registry derives the limit from volume (see Natural settle). Optional per pillow **Size**: `subSectionDividers: boolean` (default false) for a product whose sub-sections are physically walled; settle is off for it. The pillow's protector walls its three **Sections** and nothing else (2018 drawings, Further Notes), so it is `false` for every pillow **Size**.
- `resolveDims(item, effective)` returns `{ dims, source: "configured" | "measured" | "fallback" }` — `configured` when a Settings row overrides the code value (slice 12), `measured` for the code default. The fallback is the family's default (3D, 6D, 6D+) and, failing that, a generic pouch. Never throws, never returns undefined — the x-ray must not blank on a new **Item**.
- Values ship as Ivan's measurements (intake table in Further Notes) as the code defaults. Slice 12 adds the Settings page that overrides them per environment (`filling_dimension_overrides`, `neck_support_dimension_overrides`, and `site_settings.xray_loft_allowance_pct` for the allowance): row wins, no row = code default, Reset deletes the row. An entry Ivan has not provided yet is *unmeasured* on the page and a hatched fallback in the x-ray, so the intake tables seed but do not block.

### New deep module — `lib/spatial-fillings/fit.ts`

Pure, deterministic, O(pieces):

- Per **Layer**: relaxed width = Σ piece widths + seams; available = the **Section** width; `widthRatio` = min(1, available / relaxed); status `ok` when relaxed fits, `compressed` when it fits only by squeezing (each piece no narrower than its minimum width, squeeze shared pro rata by each piece's compressible range), `over` when even fully squeezed it does not.
- Per **cell**: relaxed loft = Σ of each **Layer**'s thickest piece; minimum loft = Σ of each **Layer**'s thickest *compressed* piece; max loft = the pillow's for its **Size** and **Section** (the centre is one inch lower than the sides). Status `ok` / `compressed` / `over` by the same rule, compression shared pro rata across **Layers** by compressible range. `ponytail:` foam does not compress linearly; the pro-rata rule is the simplest deterministic one, and slice 10 calibrates it against real builds.
- Per pillow: cells, plus per-**Section** summary (the cross-section reads this), plus the worst status.
- `wouldFit(placements, change, ctx)` for the add / move refusal — the same function on the hypothetical result, no second rule set.
- Loft is the height signal the brief asks for; width is the second axis the same model gives for free. Length (front-to-back) is clamped to the **cell** and never an error: a pouch longer than a **sub-section** is drawn spanning it, which is what it does physically.

### New deep module — `lib/spatial-fillings/settle.ts` (natural settle)

Pure, deterministic, runs between layout and fit: authored rects in, settled rects out, `fitPillow` reads the settled ones.

- **What a pouch is, physically.** A closed pouch of fill has a fixed volume `V = widthMm × lengthMm × thicknessMm` (relaxed). Its thickness can fall to `minThicknessMm`; its footprint can grow until it does, so the natural spread limit along an axis is `V / (widthMm × minThicknessMm)` — the same variable compression uses, read the other way. `flatLengthMm`, when the registry carries it, caps that lower. *Amended 17-10-2026 (Ivan, slice 13): the fabric does not stretch, so the volume limit is never the one that binds. Unmeasured, the cap is the fabric's give, `(π/2 − 1) × (thickness − minimum)`, plus the length a cell had cut off a pouch longer than it.*
- **Where it may spread.** Along front↔back, within its own **Section** (chamber walls are walls) and its own **Layer** (a plane spreads within its plane; sag between **Layers** is out of scope). Never across x into a neighbouring **Section**, never into a **sub-section** that holds a piece of the same **Layer**.
- **The rule.** For each **Section** × **Layer**: the empty **sub-sections** form voids; each void is claimed by the occupied **sub-section**(s) touching it. Every piece in a claimant spreads along y into the void up to the smaller of the void's length and its own remaining spread capacity. A void touched from both ends is split where the two claimants' capacities meet, pro rata by capacity, so two pouches meet at one seam and stay two outlines (guardrail 2). Thickness follows: `V / (widthMm × settledLengthMm)`, floored at `minThicknessMm`. A pouch that cannot fill its void leaves the remainder empty; the authored anchor plus any nudge decides which end of the void the gap sits at.
- **Order with compression.** Settle first (voids absorbed, thickness reduced by spread), then loft fit per **sub-section** column on the settled thickness, so a stack that does not fit in the middle but has an empty back behind it is judged with that back. A settled pouch contributes its settled thickness to every column it spans.
- **Off switch.** `subSectionDividers: true` on the **Size** makes the pass the identity.
- **Display only.** Writes nothing. `PillowPlacement` is untouched; pack list, fingerprint and **Promote** grouping cannot see it. `ponytail:` the pro-rata split and the per-**Layer** plane are the simplest deterministic rules; slice 10 photographs a real slumped pouch against them.

### Changed module — `lib/spatial-fillings/xray-layout.ts`

- `layoutPlacements(placements, ctx)` where `ctx` carries the pillow **Size**, the dims resolver and the fit result. The `itemScales` parameter and `visuals.ts` `sizeScale` are retired; the tests move with them.
- A piece's rect is its footprint × `k` × its width ratio. Pieces in a **Layer** pack left-to-right in slot order, **centred as a group** in the cell; front-to-back centred. One pouch sits in the middle of its cell with room around it — this is the visible difference from today.
- Depth: each **Layer**'s offset is its *compressed* thickness × `k` × a foreshortening constant, clamped so the deepest slab stays inside the cell. Thick stacks step more than thin ones. The scrim stays.
- Determinism holds: same inputs, same rects. The existing layout tests keep passing where they assert invariants (disjoint, inside the frame, stable keys, emitted deepest-first); the ones that assert "fills the tract" are rewritten to assert "footprint-true".

### Renderer — `components/spatial/xray-pillow.tsx`

- Props: `pillowSize` (falls back to M with a `ponytail:` note when a host cannot know it — today every host can) and `itemDims` (item id → resolved dims), derived beside `itemSubtypes` in `XrayEditor`'s `useItemMaps` and in `mp-config-client`'s existing memoised maps. `itemSizes` goes away.
- **Two views of one recipe.** Settled is the default render everywhere: the shopper preview, **Result** read-only, Configure, and every **Section** the editor is not diving into. The dived **Section** draws its pieces at their authored rects (crisp **cells**, the drop targets and move pad refer to them) with the settled outline underneath as a dashed ghost, so the effect of an edit is visible live. Leaving the dive morphs each piece from authored to settled: the two outlines are conformed polygons of the same pouch, so the interpolator is prepared once per transition (not per frame), passed through the existing degeneracy check, and falls back to the crossfade — `d` and opacity only, no layout (guardrail 4). A settled piece conforms against silhouette ∩ **Section** (`SECTION_HIT_PATHS`) rather than its **cell** polygon; the **sub-section** dividers become faint guides drawn only in the dive.
- Compression on the pouch itself: a squeezed piece's stroke turns dashed and, when the piece is wide enough for a label, a `↕ 78 %` micro-label joins the type label. An `over` piece gets a red tint. *Amended 1-11-2026 (Ivan): nothing turns red and there is no `↕` / `↔` percentage. A squeezed or `over` piece keeps the dashed stroke; the gauge, its warning and the Section tab's dot say it in amber; the cut hatches it. The banner below is gone too.* No new shapes, no rects — ADR 0009 guardrail 1 is checked by the existing `.check.ts`.
- Cell status ring: the cell clip path itself stroked amber (`compressed`) or red (`over`), inside the silhouette clip. A stroke on an existing region path, not a new element class.
- Dive panel: a loft gauge (`42 / 60 mm`, bar) per cell, and the fit message when the cell is not `ok`. Phone dock: the same gauge and message per cell group.
- Add refusal reuses the toast path `addToCell` already has; the message comes from a pure `fitMessage(cellFit, size)`.
- Banner under the x-ray when any cell is `over` after a load or a **Size** change; the hold CTA (configurator) and Save (Admin) confirm once. Advisory, never blocking.
- Shared templates: the **Size membership** chips on the Configure editor show a fit dot per member **Size** (derived from `fitPillow` at each size — cheap, it is O(pieces) per size).

### New shallow module — `components/spatial/xray-cross-section.tsx`

- Pure SVG from the fit result. Two cuts: **across** (left, center, right at a chosen **sub-section**, default middle) and **along** (front, middle, back of the dived **Section**, or of center when nothing is dived). A dashed cut line on the x-ray shows where the section is taken, so the two views are linked.
- Reads the settled fit: a pouch that spread across middle and back contributes its thinner, settled thickness to both columns, so a stack that spilled into an empty back shows as two lower columns rather than one tall one and a gap. Shell drawn as a lens per **Section** whose height is that **Section**'s max loft (the centre lens is lower); each **Layer** a rounded slab of its compressed thickness, coloured by family through the same CSS variables the pouches use; compressed slabs hatched; an `over` stack drawn through the loft line in red; a dashed loft line with its mm label; each **Section**'s loft in mm under it.
- Mounts: under the pillow on the configurator stage (Staff and guest — the guest gets no controls, just the across cut), beside the pack list on the Configure card page and on **Result** assign, and in the phone layout above the dock, collapsible.
- No animation on the slabs in v1: the values change discretely with the mix, and ADR 0009 guardrail 4 keeps animation to transform / `d` / opacity. `ponytail:` a `transform: scaleY` transition is one CSS line if it ever wants to breathe.

### Moves — `lib/configurator/staff-assist.ts`

- `movePiece(placements, ref, to)` where `to` is a **cell**, an optional **Layer**, an optional position in the **Layer**. Re-slots in the target, compacts **Layers** in both **cells**, drops `insertOrder` when the **Section** changes and keeps it otherwise. Refuses (same shape as `addPiece`) when the target **Layer** is full or the move `wouldFit` says `over`.
- `shiftPieceLayer(placements, ref, ±1)`: to the adjacent **Layer**, creating one below the deepest if needed; compaction closes the one it left.
- `reorderInLayer(placements, ref, ±1)`: swaps slot order with the neighbour. Slot is the piece key, so both pieces' slots are rewritten together; the fingerprint ignores slots (`canonicalizePlacements`), the pack list ignores them, so nothing downstream moves.
- Every move acts on the authored **cell**, **Layer** and order; settle is re-derived from the result, so a piece moved into a **sub-section** that a neighbour had settled into simply pushes that neighbour back to its own **cell**. Selection shows the authored **cell** ring and the settled ghost together.
- Selection is renderer state (`selected: PieceRef | null`), cleared on dive exit like the picker. Keyboard, in the dive: ← → reorder in the **Layer**; ↑ ↓ move to the front / back **sub-section**; `[` `]` **Layer** up / down; Shift + ← → move to the neighbouring **Section**. An on-canvas pad with the same six actions sits in the cell panel (desktop) and the dock (phone), because touch has no keyboard.
- Undo: the Mirror toast pattern — an inverse applied only while the move is still the last thing that happened (`placementsRef`).
- Drag (slice 07): a pouch group becomes a dnd-kit draggable, the nine cell hit paths (already clipped to the silhouette) become droppables, the layer rows become droppables for a depth target. The drop resolves through `movePiece`, so a drag can never do something a keystroke cannot. The adapter is pure (`lib/dnd/`), like `layerDragDestination`.

### Fine nudge (slice 08, gated)

- Two nullable `smallint` columns on both placement tables: `offset_x_mm`, `offset_y_mm`, `|v| ≤ 200`. Additive and nullable, the `insert_order` migration pattern. Bolster tables untouched.
- Visual-only: out of `canonicalizePlacements`, so out of the fingerprint and the pack list; a test asserts the fingerprint is byte-identical with and without offsets.
- Every **Placement** reader selects them and every writer accepts them (assist route, Admin template route, **Result** assign); the `api-contract.check.ts` row-index contract grows two columns.
- In the settled view a nudge is the anchor: when a pouch cannot fill its void, the nudge decides which end the gap sits at; when it can, the nudge is absorbed and the piece reads unchanged.
- Interaction: with a piece selected, Alt + arrows (or the pad's Fine toggle) nudges 5 mm; the layout clamps so the footprint stays inside **cell** ∩ silhouette minus the seam, then the conform pass deforms at the shell as it does today.
- **Gate:** build only if the slice 10 sign-off finds discrete positions (cell × **Layer** × order) insufficient for what the build team needs to see. Ponytail: the simplest thing first; this is the upgrade path, named.

### Mbolster (slice 09)

- `BOLSTER_DIMENSIONS[length]` gives the capsule's length and diameter. `fitBolster`: Σ pouch widths along the capsule vs its length (`ok` / `compressed` / `over`); thickness vs diameter is a per-piece check. The "no cap in v1" note in ADR 0008 is amended: the cap is physical, derived, never a slot number.
- Settle in one dimension: pouches spread along the capsule into its empty ends by the same volume rule, thinning toward the diameter's floor.
- End-on cross-section (a circle with the stack inside) beside the capsule; the same status ring and gauge.

### Glossary and ADR (slice 01)

- `CONTEXT.md` gains **Product dimensions**, **Loft**, **Fit status** (`ok` / `compressed` / `over`, always derived), **Cross-section view**, **Nudge**, **Natural settle** (with **Authored** and **Settled** as the two views of one recipe), and amends **Filling visual** (scale now comes from the registry, not `items.size` alone).
- ADR 0019: pillow geometry in code (mm, from the drawings); pouch, **Neck support** and loft-allowance values as code defaults with database overrides edited in Settings (the ADR 0009 colour pattern, slice 12); fit derived on read and never persisted; the pro-rata compression rule; the advisory-not-blocking error posture.

### Performance and mobile

- One memo: `useMemo(() => fitPillow(settle(layout(...))), [placements, pillowSize, itemDims])`, and the geometry chain reads it. Settle is O(pieces) per **Section** × **Layer** and joins the same memo. The cross-section and the gauges take the same object as a prop. No second polygon scan, no new dependency.
- Phone: the cell rings and the compression marks are on the canvas already; the gauge, message and move pad join the dock groups; the cross-section sits between the x-ray and the dock, under a disclosure open by default (owner, 2026-11-19).

## Testing Decisions

A good test here asserts what the modules return for a given mix and **Size**, never how the SVG is structured. The repo's split stands: vitest for pure library code, executable `.check.ts` self-checks for wiring and guardrails.

**Tested (vitest): the registry.** Every seed and live descriptor (`"3D (S)"`, `"6D (L)"`, `"6D Fold"` + size, `"6D+ (Folded)"`, `"6D (Round)"`, the **Neck support** sizes) resolves to a measured entry; an unknown descriptor resolves to its family default with `source: "fallback"`; key normalisation is total (never two keys for one pouch). Prior art: `filling-groups.check.ts`, `pack-list-labels-neck-support.test.ts`.

**Tested (vitest): the fit model.** Relaxed, compressed and over cases for width and for loft; pro-rata sharing sums exactly to the available budget; determinism across input order; `wouldFit` agrees with `fitPillow` on the applied result; the legacy caps still refuse first when they bite first. Prior art: `xray-layout.test.ts`.

**Tested (vitest): settle.** One pouch in center/middle with front and back empty spreads both ways up to its capacity and thins to `V / (w × l')`, never below `minThicknessMm`; a pouch whose capacity is smaller than the void leaves the remainder at the end the nudge says; front and back both occupied with the middle empty meet at one seam split pro rata and stay two rects; nothing crosses a **Section** wall or a **Layer**; `subSectionDividers: true` is the identity; the pass is input-order independent; and `fitPillow` of the settled result reports a lower loft than of the authored rects for the spill case. Prior art: `xray-layout.test.ts`.

**Tested (vitest): the layout.** A single pouch renders at footprint × `k` centred in its cell; two pouches do not shrink each other while they fit; a compressed **Layer** narrows pieces to their ratio and no further; depth offsets grow with thickness; all existing invariants (disjoint, inside the frame, stable keys, deepest-first) still hold.

**Tested (vitest): the moves.** `movePiece`, `shiftPieceLayer`, `reorderInLayer`: slot uniqueness per cell, dense **Layers** afterwards, `insertOrder` kept within a **Section** and dropped across, refusal on full or `over`, and the drag adapter mapping a dnd-kit event to the same call. Prior art: `layer-drag.test.ts`, `staff-edit.test.ts`.

**Tested (vitest): the nudge** (if built). Clamp inside cell ∩ silhouette; fingerprint invariance with and without offsets.

**Tested by self-check.** The renderer guardrails (`xray-pillow.check.ts`): still no `<rect`, the status ring strokes an existing cell path, settled pieces conform against the **Section** region and the dive ghost is a dashed stroke of the same path; the settle transition goes through `prepareMorph` and falls back to crossfade; `surface-parity.check.ts`: the cross-section is mounted on all three surfaces and read-only on the shopper preview; `api-contract.check.ts`: every **Placement** reader selects the offset columns once slice 08 lands; a new `dimensions.check.ts` that fails while the `PLACEHOLDER` flag is set, so CI cannot ship typed-in numbers.

**Not tested automatically:** whether the drawn loft matches the real pillow. That is slice 10, a person with a ruler.

## Out of Scope

- **Physics.** No soft-body, no collision solver, no WebGL, no generated blobs (ADR 0009). The fit model and the settle pass are arithmetic over rectangles, thicknesses and volumes. *Amended 18-10-2026:* the cross-section's drawing is now a soft-body settle (ADR 0025); the fit and settle are unchanged.
- **Dynamic settle.** No gravity, no head pressure, no sag from one **Layer** into an empty **sub-section** of the **Layer** below, no spread across a **Section** wall. Settle is static and per plane; the calibration slice says whether that is enough.
- **Designer shapes and the asset pipeline.** The silhouette, the nine cell polygons and the two shapes stay the ADR 0009 placeholders; this PRD scales and places them.
- **Editing pillow geometry.** Outlines, section widths and gusset heights come from the 2018 drawings and stay in code; only the pouch and **Neck support** dimensions and the loft allowance are editable (slice 12).
- **Rules engine.** A rule still selects *which* template; fit is a property of the selected mix, and a template that does not fit its **Size** is a Configure warning, not a rule.
- **Pack list, COGS, fingerprint, Promote grouping.** All unchanged. Fit, compression, moves within a cell and nudges are visual or assembly concerns and never touch what is picked or how a mix is grouped.
- **Shopper editing.** The read-only x-ray and cross-section gain no affordance.
- **Weight and firmness.** Density families differ in feel as well as size; modelling firmness is a separate PRD.
- **Warehouse templates and BOMs.** ADR 0003 stands.

## Further Notes

**The intake.** Slice 01 cannot close without these. Ivan fills the tables; the slice records them in `dimensions.ts` with a comment naming the date measured.

Pillow (per **Size**):

| Size | Width, left↔right (mm) | Length, front↔back (mm) | Height, side / centre (mm) | Section widths L / C / R (mm) |
|---|---|---|---|---|
| XS | 604 ⁽ᵈ⁾ | 306 ⁽ᵈ⁾ body at the lobe line (the 47 × 106 tab is not drawn) | side 101 (4''), centre 76 (3'') ⁽ᵈ ˢ⁾ | 204 / 195 / 204 ⁽ᵖ⁾ |
| S | 647 ⁽ᵈ⁾ | 330 ⁽ᵈ⁾ body (70 × 127 tab not drawn) | side 127 (5''), centre 102 (4'') ⁽ᵈ ˢ⁾ | 203 / 240 / 203 ⁽ᵖ⁾ |
| M | 706 ⁽ᵈ⁾ | 330 ⁽ᵈ⁾ body (bottom sheet — the master silhouette; the protector's 73 × 147 tab not drawn) | side 153 (6''), centre 128 (5'') ⁽ᵈ ˢ⁾ | 223 / 260 / 223 ⁽ᵖ⁾ |
| L | 762 ⁽ᵈ⁾ | 350 ⁽ᵈ⁾ body (85 × 150 tab not drawn) | side 178 (7''), centre 153 (6'') ⁽ᵈ ˢ⁾ | 251 / 260 / 251 ⁽ᵖ⁾ |
| XL | 836 ⁽ᵈ⁾ | 365 ⁽ᵈ⁾ body (92 × 170 tab not drawn) | side 203 (8''), centre 178 (7'') ⁽ᵈ ˢ⁾ | 279 / 279 / 279 ⁽ᵖ⁾ (equal thirds) |

⁽ᵈ⁾ read off the 2018 case drawings (below), confirmed by Ivan 22-9-2026. ⁽ᵖ⁾ read off the 2018 protector drawings (the divider seams on the Inner Single Top sheets, below), confirmed by Ivan 25-9-2026. ⁽ˢ⁾ *Mpillow Sizes Measurement.xlsx* (Drive, 2020): Pillow Height (Side) 4''–8'' and Pillow Height (Center) 3''–7'' — the centre **Section** is one inch lower than the sides, one size step per 2'' of shoulder width (14''–23''). The drawings agree: the "Cover Side" strip is the side height (101 / 127 / 153 / 178 / 203) and the case gusset drops 25 mm at the centre back (76 / 102 / 128 / 153 / 178). Max loft is therefore per **Section**, `[side, centre, side] × (1 + LOFT_ALLOWANCE)`, allowance 10 % by default and configurable — cloth gives; the protector's gusset is the same height, so the case and the protector share it.

Heights per **Size** (Ivan supplies the side-view SVG later; it is scaled so the sides read the drawn side height and the centre the drawn centre height, its length to the **Size**'s width):

| Size | Side height ("Cover Side" sheet; spreadsheet) | Centre height (case gusset at the centre back; spreadsheet) | Drawn side / centre, × (1 + `LOFT_ALLOWANCE`) at 10 % |
|---|---|---|---|
| XS | 101 (4'') | 76 (3'') | 111 / 84 |
| S | 127 (5'') | 102 (4'') | 140 / 112 |
| M | 153 (6'') | 128 (5'') | 168 / 141 |
| L | 178 (7'') | 153 (6'') | 196 / 168 |
| XL | 203 (8'') | 178 (7'') | 223 / 196 |

**Measured from the 2018 case drawings.** Source: Drive › *01 Drawing* (2018) › the COVER folders — drawing "Cover" is the current **case**, drawing "Inner" the current **protector**, drawing "Protector" the current **cover**. The PDFs are 1:1 (PDFCreator, A0/A1); every figure below is the finished size with the 10 mm seam allowance removed, read from the vector geometry, and agrees with the sheet labels (24/26/28/30/33'' widths, 4/5/6/7/8'' sides). XS is dated 22-11-2017, the rest 13-3-2018; the S, M and L sheets are titled "No Neck Line". M has Side and Bottom sheets only, so its plan figures come from the bottom panel (the protector Top sheet shows its tab, 73 × 147, below); that bottom panel is also the master silhouette for every **Size** (decision 7). Orientation (confirmed): the notched edge with the centre tab is the **front** (shoulders in the notches, tab under the neck); the wave edge is the **back**. So the **sub-section** *front* is the tab side.

Plan, top panel (mm):

| Size | Width | Body length (lobe line, the drawing's "length") | Length on the centre line, tab tip → back edge | Tab length × width | Body length on the centre line, without tab | Notch depth / mouth at the lobe line | Back wave, concave depth at centre | Flat end edge |
|---|---|---|---|---|---|---|---|---|
| XS | 604 | 306 | 311 | 47 × 106 | 264 | 80 / 184 | 42 | 136 |
| S | 647 | 330 | 359 | 70 × 127 | 289 | 91 / 195 | 41 | 161 |
| M (bottom panel) | 706 | 330 | 289 (no tab on the bottom) | – | 289 | 97 / 211 | 41 | 161 |
| L | 762 | 350 | 382 | 85 × 150 | 297 | 104 / 237 | 53 | 159 |
| XL | 836 | 365 | 404 | 92 × 170 | 312 | 120 / 258 | 53 | 172 |

Gusset, the side band ("Cover Side", two identical strips per case; mm):

| Size | Full height H | Height at the tab end | Taper run, tab end → H | Height at centre back | Dip run | Strip length |
|---|---|---|---|---|---|---|
| XS | 101 (4'') | 20 | 147 | 76 (H − 25) | 109 | 865 |
| S | 127 (5'') | 20 | 144 | 102 (H − 25) | 122 | 930 |
| M | 153 (6'') | 20 | 172 | 128 (H − 25) | 132 | 985 |
| L | 178 (7'') | 20 | 201 | 153 (H − 25) | 132 | 1057 |
| XL | 203 (8'') | 20 | 228 | 178 (H − 25) | 156 | 1123 |

So the case is full height along the ends and the back, drops 25 mm over the last ~110–160 mm to the centre back (zipper end), and tapers to a 20 mm edge under the neck tab over the last ~150–230 mm of each strip — the taper edge is sewn into the notch (its arc length is the "AL 175 / 200 / 228 / 270 / 308" note on the sheets). *Mpillow Sizes Measurement.xlsx* lists "Pillow Height (Side)" as 4''–8'', i.e. the same H.

Reference files, `.claude/PRD-xray-pillow-ux/reference/`: `case-outline-<size>.svg` and `.json` (the finished outline as a polygon in mm; x = width from the left end, y = 0 at the back extreme, front/tab edge at max y), `case-plan-metrics.json`, `case-gusset-profile.json`. Slice 01 turns these into the registry.

Decisions on the drawings (Ivan, 22-9-2026): (1) front is the tab edge, back is the wave edge; (2) the x-ray silhouette follows the **top panel** outline, and the product is visualised from the top and from the side; (3) M has no Top sheet, so its bottom-panel outline stands in for its top (no tab); (4) the neck line is ignored for every **Size** and never displayed; (5) the side-view height is the drawing's gusset height plus a configurable allowance, 10 % by default, because the case is cloth and gives; (6) the same figures and the same allowance feed the fit budget. Ivan, 25-9-2026: (7) **the silhouette is the M shape for every Size** — the traced M bottom panel (`reference/silhouette-master.json`) scaled to each **Size**'s width and body length at the lobe line; the tab the other Top sheets carry is not drawn, because it makes the centre **Section** too long (scaled this way the master sits within 9–12 mm of each traced panel outside the tab, `reference/silhouette-metrics.json`; the scaled results are `reference/silhouette-<size>.json/.svg`); (8) the divider positions are confirmed; (9) the side view uses the "Cover Side" height per **Size** at the sides and one inch less at the centre (table above, from the drawings and *Mpillow Sizes Measurement.xlsx*), and Ivan supplies the side-view SVG later. The **protector** sheets (drawing "Inner", the bag the fillings actually sit in) are read the same way below.

**Measured from the 2018 protector drawings.** Source: the same COVER folders › *Inner Single Top* (sheet 1 of 3) and *Inner Single Side, Divider* (sheet 2 of 3) per **Size** — drawing "Inner" is the current **protector**, the waterproof bag the fillings actually sit in. Top sheets dated 22/23-11-2017 (XS, S, M) and 13-3-2018 (L, XL); Side/Divider sheets revision B, 21-5-2018 (XS, S, M), 28-5-2018 (L), 6-6-2018 (XL). Read the same way as the case: 1:1 vector geometry, 10 mm seam allowance removed, checked against the sheet labels. Three findings.

1. **The protector's top panel is the case's top panel.** Traced outline against traced outline, the largest deviation is 0.4 mm (M) and under 0.2 mm on the other four (`reference/protector-vs-case.json`), so the case and the protector share one plan per **Size**. The M protector *does* have a Top sheet, and it carries the tab the case's bottom sheet lacks: a separate 73 × 147 rectangle sewn to the centre of the front edge (the other **Sizes** cut the tab in one with the panel). Plan, mm:

| Size | Width | Body length (lobe line) | Centre line, tab tip → back edge | Tab length × width | Notch depth / mouth | Back wave depth | Flat end edge |
|---|---|---|---|---|---|---|---|
| XS | 604 | 306 | 311 | 47 × 106 | 80 / 184 | 42 | 136 |
| S | 647 | 330 | 359 | 70 × 127 | 91 / 195 | 41 | 161 |
| M | 706 | 330 | 362 | 73 × 147 | 97 / 211 | 41 | 161 |
| L | 762 | 350 | 382 | 85 × 150 | 104 / 237 | 53 | 159 |
| XL | 836 | 365 | 404 | 92 × 170 | 120 / 258 | 53 | 172 |

2. **The protector's gusset is the case's height, without the back dip.** Two strips per bag ("Inner Single Side"), full height along the ends and the whole back — the bag closes with a 25 mm velcro strip along the back ("Side Back", "Velcro 25"), not a zipper, so there is no 25 mm drop at the centre back — tapering to the same 20 mm edge under the tab over the same run as the case. The strips are 25–50 mm shorter than the case's, which carry the zipper overlap. Max loft is therefore one number per **Size**: H × (1 + `LOFT_ALLOWANCE`), for the case's side view and for the protector's fit budget alike.

| Size | Full height H | Height at the tab end | Taper run, tab end → H | Height at centre back | Strip length |
|---|---|---|---|---|---|
| XS | 101 (4'') | 20 | 147 | 101 | 840 |
| S | 127 (5'') | 20 | 143 | 127 | 906 |
| M | 153 (6'') | 20 | 173 | 153 | 936 |
| L | 178 (7'') | 20 | 201 | 178 | 1008 |
| XL | 203 (8'') | 20 | 228 | 203 | 1074 |

3. **The protector is walled into three Sections, and only three.** Every Top sheet carries two hatched divider seams running front-to-back, and sheet 2 the two divider panels ("Inner Single Divider Left, Right"): full height — cut 126 / 152 / 178 / 203 / 228 = H + a 25 mm velcro flap; the sheets note "Divider height 126 was 151" and so on, the 2018 revision — fixed to the gusset with H × 50 (XS, S) or H × 100 (M–XL) velcro patches. Each seam runs the local front-to-back depth to within 20 mm of either edge, so a pouch cannot migrate into the next **Section**; there is no wall between front, middle and back, so `subSectionDividers` is `false` for every pillow **Size** and natural settle (slice 11) applies. The seams are **not at thirds** — the centre **Section** is narrower than the sides on XS–L and equal only on XL (the sheets label the centre 195 / 240 / 260 / 260 / 280):

| Size | Width | Left / Centre / Right | Divider seam length | Front-to-back depth at the seam |
|---|---|---|---|---|
| XS | 604 | 204 / 195 / 204 | 172 | 211 |
| S | 647 | 203 / 240 / 203 | 212 | 232 |
| M | 706 | 223 / 260 / 223 | 211 | 231 |
| L | 762 | 251 / 260 / 251 | 220 | 240 |
| XL | 836 | 279 / 279 / 279 | 192 | 232 |

`sectionWidthsMm` in the registry is therefore measured data for every **Size**, and the cell grid derives from it (slice 02) instead of today's equal thirds.

Reference files, `.claude/PRD-xray-pillow-ux/reference/`: `protector-outline-<size>.svg` and `.json` (same frame as the case outlines; M carries its tab), `protector-plan-metrics.json`, `protector-gusset-profile.json`, `protector-sections.json` (seam positions, section widths, divider panel and velcro sizes, local depth at the seam), `protector-vs-case.json` (the outline comparison).

Resolved (Ivan, 25-9-2026): (a) no tab is drawn for any **Size** — the silhouette is the M shape (decision 7); (b) the divider positions are confirmed, so `sectionWidthsMm` is final.

Filling pouches (one row per type × size the inventory actually carries; add rows as needed):

| Filling (descriptor) | Size | Width (mm) | Length (mm) | Relaxed thickness (mm) | Fully compressed thickness (mm) | Minimum width when squeezed (mm) | Lies across or along |
|---|---|---|---|---|---|---|---|
| 3D | S | | | | | | |
| 6D | S | | | | | | |
| 6D | M | | | | | | |
| 6D | L | | | | | | |
| 6D | XL | | | | | | |
| 6D (Round) | – | | | | | | |
| 6D Fold | S / M / L | | | | | | |
| 6D+ | S | | | | | | |
| 6D+ | L | | | | | | |
| 6D+ (Folded) | – | | | | | | |

Optional per pouch, only if the fabric stops a spread before the fill is fully compressed: flat (fully spread) length and width in mm. Otherwise the registry derives the limit from volume. Optional per pillow **Size**: whether the **sub-sections** are physically divided (yes / no; assumed no).

Cervical **Neck support**:

| Size | Width (mm) | Length (mm) | Thickness (mm) | Fully compressed thickness (mm) |
|---|---|---|---|---|
| XS | | | | |
| S | | | | |
| M | | | | |
| L | | | | |

Mbolster:

| Length | Capsule length (mm) | Diameter (mm) |
|---|---|---|
| short | | |
| medium | | |
| long | | |

**Timing.** Nothing here changes a fingerprint or a pack list, so it is safe at any point in the catalog's life; the ten authored templates (PRD `unified-spatial-filling-editor`) will simply start reporting a fit status, and the ones that do not fit their **Size** get an amber or red cell rather than a rewrite.

**Order.** 01 → 02 → 03 → 11 → 04 → 05 is the spine — settle sits between the fit model and the surfaces that display it, so 04 and 05 are built once against settled geometry (the fit object is the contract, so they do not change shape if 11 slips). 06 depends on 02 (selection needs the true-scale hit areas) and on 03 for its refusals; 07 on 06; 09 on 03; 08 is optional and last; 10 closes the PRD.

**Graph.** Every code slice ends with `./scripts/graphify update .` in the same commit.
