# 13: Edit on the cross-section — drag pouches between columns, Layers and Sections; puffy pouches; heights audited

Parent: #200

**Type:** AFK
**Blocked by:** 05 (the cut), 07 (every drop resolves through `movePiece`), 11 (the settle the preview shows)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** built — `lib/dnd/slab-drag.ts` (pure, tested), the editor in `components/spatial/xray-cross-section.tsx`, the cushion shapes in `components/spatial/slab-shape.ts` (tested), wired on all three Staff surfaces. Round 2 (17-10-2026): pouches inside the pillow, the outline never squashed, no rubber band (below). Driven in Chromium in a local harness against the real component (mouse, keyboard, touch); not yet seen on a deployed build.

## Goal

Ivan's brief (16-10-2026): the Left / Center / Right cut should let Staff drag, shift and stack fillings into the different areas and Layers with the smoothest interaction we can give it; check that the drawn heights follow Settings; and make the pouches look rounded and puffy side-on.

## What it does

- **Two axes, one gesture.** Across the cut is front → back, so the column under the pointer is the sub-section; up the cut is the stack, so the height is the Layer. Each of the target cell's own Layers is a band (`cellBands`): its top and bottom 35 % insert a **new Layer** above / below it, its middle **joins** that Layer (side by side across the Section). An empty column takes the pouch as its first Layer. `slabTargetAt` is the whole rule.
- **Section tabs are drop targets.** Releasing on a tab sends the pouch to the same sub-section of that Section. Resting on a tab for 450 ms opens that Section (spring-loaded), so the drop can be placed there exactly; the ghost shrinks over the tabs so the pulsing tab still reads.
- **Live preview, stable targets.** While a pouch is held, the cut draws the drop applied and the fit recomputed (`previewSlabDrop` — the same `applySlabDrop` the commit uses), so neighbours reflow, settle and squeeze exactly as they will. Hit-testing reads the *committed* layout and the vertical scale is pinned for the drag, so the zones never move under the pointer as the preview reflows. The landing spot is a dashed cushion; the line under the cut says what a release does (`Drop center back, new layer between 1 and 2 · 53 / 91 mm`), amber / red when the column would be squeezed / cannot close, and the cap refusal before the release.
- **Smooth.** Every pouch eases to its new box over 220 ms (rAF attribute writes, interruptible, skipped under `prefers-reduced-motion`); a held pouch keeps its identity in the preview, so it glides from where it was to where it will land.
- **Keys** (a click or tab selects a pouch): ← → front / back, ↑ ↓ one step up / down the stack, Shift + ← → the neighbouring Section; the selection and the cut follow the pouch. Side-on, two pouches in one Layer draw over each other, so ↑ ↓ (`stepSlabLayer`) never merges: a lone pouch swaps with its neighbour, a shared one splits out above / below. Escape lets go of a held pouch where it was.
- **Touch.** A non-passive `touchstart` on the pouch handles (attached by callback ref — on a phone the cut mounts later, inside its disclosure) keeps the page still under a finger drag and scrollable everywhere else.
- **Undo** is the x-ray's: one `xray-move` toast for both views, an inverse applied only while the move is still the last thing that happened.
- **Tabs** show each Section's piece count and an amber / red dot when it is compressed / cannot close.

## Puffy pouches

`puffyPath` draws a stuffed cushion inside the slab's box: rounded ends, a crowned top, all cubic with matching tangents (no kinks, no rects). Stacked pouches still sum to the column's loft. The cushion's shape gives the volume (round 2 dropped the sheen stroke along the crown — it read as a shiny highlight; 2026-11-01 dropped the drop shadow, resting and held, and the vertical and radial shade, so the side view draws its pouches in flat family colour with a white edge, like the top view). The cushion flattens with `puff` = drawn ÷ relaxed thickness, so a pouch that settled into an empty neighbour, or is squeezed to close, looks pressed. The Neck support roll and the Mbolster end-on slab are drawn the same way.

## Round 2 (Ivan, 17-10-2026): inside the pillow, never squashed, no rubber band

Ivan's notes on the first build: keep the puff, lose the highlight line; the phone view squashed the side view, and its ratio must stay the same; the fillings should look contained *inside* the outline, the way pouches sit in a real pillow seen in section (two circled spots where a pouch poked through the front tip and the back corner); pouches can be puffier and squishier, but cannot expand like a rubber band — show that physics.

- **Never squashed.** `cutFrame` draws each designer profile at its own width ÷ height on every screen. It is as wide as the view allows, or narrower when that would make it taller than `maxShellH`. The phone shows the same shape smaller: only the type grows. Up, the profile's peak inside the case is still the side Sections' max loft, so the vertical mm scale follows from the profile (`ky`), not from the stack. The view grows only for an `over` stack. The svg carries `data-xray-cut-aspect`, and the component test asserts that desktop and phone draw the outline at the same uniform scale.
- **Inside the case.** Every pouch outline is pressed into the outline (`pouchPath`): each point outside the case, or within `SHELL_MARGIN` of it, moves to the nearest point that margin inside (`pressIn` against the profile as a polygon, `shellPolygon`). Then one smooth curve runs through the result. A pouch in the front tip takes the tip's shape; one in a rounded corner follows the corner. Pouches rest on an inside floor a margin above the outline's flat edge. A pouch clear of the walls keeps its exact eight-cubic cushion. A stack that cannot close is not pressed in: it pokes out of the case, red, which is what "cannot close" means.
- **Squish.** A face something presses on flattens; a free one domes (`AlongSlab.pressed`, from `alongSlabs`). The top flattens when a pouch lies on it. An end flattens against a neighbour within a seam, or against the Section's end. The underside always rests on something, so it is all but flat. Free tops crown higher than round 1's.
- **Drape.** A pouch is soft: where what is under it falls away, its underside follows the support as a ball of radius 1.2 × its thickness rolled along under it would trace, smoothed so a narrow gap hangs as one curve, never through what is under it or below the back panel. The top follows the underside smoothed over the pouch's own thickness. So over a narrow gap the fill pools and the top barely dips, while a pouch half on a ledge bends over it. The plane above rests on the draped tops (`sagMm`, `sagTopMm`). The label rides the sag.
- **No rubber band** — see slice 11's amendment. A pouch gets back the length its cell cut off, plus `(π/2 − 1)` mm per mm of thickness its fabric gives (or the measured flat length), and no more. In the reference screenshot (XS) the lower 6D now reaches about a third into the empty middle at 28 mm, not across it at 17 mm. The 6D Fold above the gap hangs into it.

## Heights audit (16-10-2026, against production)

The drawn heights follow Settings; Settings simply has no pouch rows yet.

- `filling_dimension_overrides` and `neck_support_dimension_overrides` are **empty**; `site_settings.xray_loft_allowance_pct` = **20**. Every pouch therefore draws at its unmeasured family default (6D 45 / 25 mm, 3D 35 / 20 mm thick / min) for a **Size M** pillow.
- Live inventory keys resolve as the catalogue keys them (`6D`+S → `6d/s`, `6D Fold`+S → `6d/folded/s`, `3D`+S → `3d/s`, `6D Round`+S → `6d/round/s` → `6d/round`), so a row typed into Settings will be picked up.
- The reference screenshot is an **XS** pillow: the centre budget is 76 mm × 1.20 = **91 mm**; thickness scales by the side gusset (101 / 153 = 0.66), so 6D draws 30 mm and 3D 23 mm; the lower 6D had an empty plane beside it, spread across two columns and thinned to ~17 mm (volume kept). Hence 46 mm in every column.
- **New:** hover or select a pouch and the line under the cut says exactly that, from the Settings row to the drawing — `30 mm drawn: 45 mm for Size M (not in Settings — family default) → 30 mm at Size XS → 17 mm spread along the Section` (`slabThicknessNote`).
- The `max … mm` label is drawn once per Section, not once per column.

## Fixed on the way: a same-cell move landed one Layer too high

`movePiece` takes `to.layer` as an index into the cell's Layers *with the piece lifted out*, but wrote it as the stored `row` without renumbering. When the piece was alone in its Layer and moved deeper in its own cell, the Layers below kept their old rows, so it landed one Layer too high: **Layer down (`]`) on a lone top pouch did nothing**, and a Layer-picker drop onto Layer 3 joined Layer 2. It now compacts the cell first when the move stays in it (`move-piece.test.ts`).

## Acceptance criteria

- [x] vitest: `slab-drag.test.ts` — band zones, every drop kind (other column, between Layers, onto a Layer, own column reorder and no-ops, split a shared Layer, other Section, cap refusal), the preview, `stepSlabLayer`, the drop wording.
- [x] vitest: `slab-shape.test.ts` — one closed curve of cubics inside its box, flatter when spread / squeezed; `cross-section.test.ts` — relaxed → settled → drawn thickness and the note; `xray-cross-section.test.tsx` — cushions, labels, one loft label, focusable handles, the landing and ghost while held.
- [x] `surface-parity.check.ts`: the cut is editable on all three Staff surfaces and read-only for a guest; the preview and the commit go through the one pure move.
- [x] Browser (local harness, real component): mouse drag between columns, into a gap, onto a spring-loaded tab and into another Section; keyboard ← → ↑ ↓ ⇧←; Undo; Escape; a phone touch drag with no page scroll; light and dark themes.
- [x] Round 2, vitest: `settle.test.ts`, `bolster-fit.test.ts`, `fit.test.ts` re-derived from the fabric rule (the give, the volume ceiling, a measured flat length; a real excess stays compressed). `slab-shape.test.ts` covers pressed faces, the sag, pressing into a slanted wall, profile parsing and the smooth closed curve. `xray-cross-section.test.tsx` checks the same uniform-scale outline on desktop and phone, every pouch anchor inside the outline, a free pouch still eight cubics, and no sheen.
- [x] Round 2, browser (local harness): XS and M centre, XS left, phone; the drag, keyboard, spring-tab and touch flows re-run with the new frame.
- [ ] Ivan on a deployed build, tablet and phone.
- [x] `./scripts/graphify update .` from a cold cache, committed.
