# 13: Edit on the cross-section — drag pouches between columns, Layers and Sections; puffy pouches; heights audited

Parent: #200

**Type:** AFK
**Blocked by:** 05 (the cut), 07 (every drop resolves through `movePiece`), 11 (the settle the preview shows)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** built — `lib/dnd/slab-drag.ts` (pure, tested), the editor in `components/spatial/xray-cross-section.tsx`, the cushion shapes in `components/spatial/slab-shape.ts` (tested), wired on all three Staff surfaces. Driven in Chromium in a local harness against the real component (mouse, keyboard, touch); not yet seen on a deployed build.

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

`puffyPath` draws a stuffed cushion inside the slab's box: rounded ends about half its height, a crowned top and a slight belly, all cubic with matching tangents (no kinks, no rects). Stacked pouches still sum to the column's loft — a crown meets the belly above it and the shoulders leave a gap, which reads as two cushions. A vertical shade, a sheen along the crown and a soft drop shadow give the volume. The cushion flattens with `puff` = drawn ÷ relaxed thickness, so a pouch that settled into an empty neighbour, or is squeezed to close, looks pressed. The Neck support roll gets a radial shade; the Mbolster end-on slab uses the same cushion.

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
- [ ] Ivan on a deployed build, tablet and phone.
- [x] `./scripts/graphify update .` from a cold cache, committed.
