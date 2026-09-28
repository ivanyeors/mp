# 02: True-scale rendering — pouches drawn at their footprint relative to the pillow Size, on every surface

Tracker: #202 · Parent: #200

**Type:** AFK
**Blocked by:** 01 (the registry; can be built against placeholders and verified once the numbers land)
**User stories:** 1, 2, 3, 4, 46, 47
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`

## Goal

One pouch in a cell is drawn as one pouch, with room around it. Five 6D L across a **Section** are drawn as five 6D L. The pillow **Size** sets the scale.

## The gap, precisely

- `lib/spatial-fillings/xray-layout.ts` `packRows`: "Pieces always fill their tract" — a piece's rect is the row split by weight, never its size.
- `packPieces` auto-splits a layer into 1–2 rows to fit more pieces bigger; `packDepthStack` shifts each layer by a fixed `DEPTH_OFX = 7`, `DEPTH_OFY = 14`.
- `layoutPlacements(placements, itemScales)` takes a relative weight map (`itemScaleMap` in `xray-pillow.tsx:78`).
- The pillow **Size** is known on every host and passed to none of them: `size` in `mp-config-client.tsx`, `selectedSize` on the Configure card page, `assignSize` on **Result** detail.

## Scope

- **Scale:** `k = XRAY_VIEW.width / PILLOW_DIMENSIONS[size].widthMm`. The silhouette keeps filling the stage. `COL_X` derives from `sectionWidthsMm × k` — every **Size** carries them (the protector's divider seams), so the centre column is narrower than the sides on XS–L and equal thirds only on XL.
- **Silhouette per Size:** the stage path is `PILLOW_DIMENSIONS[size].outline` scaled by `k` (the M shape at every Size, no tab; notched front edge at the top of the stage), replacing the fixed placeholder path; the nine cell polygons are cut from it at the section widths. Prepared morphs (ADR 0009) are rebuilt from the same outline. The neck line is never drawn.
- **Layout:** `layoutPlacements(placements, ctx: { pillowSize, dimsOf })`. *Amended again 28-9-2026 (Ivan): back to true scale — a small filling must read smaller than a large one and must not stretch to fill the space it leaves; the pillow draws every pouch at its footprint (`packTrue`), centred, movable within the free space by slice 08's offset. The notes below describe the 26-9 fill drawing, which the Mbolster keeps.* *Amended 26-9-2026 (Ivan, on the desktop screenshots):* the FIT judges every piece at `widthMm × k` by `lengthMm × k`, but the DRAWING fills the compartment — a real pillow reads fully stuffed, so a layer's slab is split by the pieces' footprint widths (their squeezed widths when the fit says so), every piece runs to its tract's walls and the cell's length, and only the hair of a seam (`GAP`) stays between pieces whatever the squeeze. The footprint-true pack with its centred voids is gone. Second pass the same day: the shell seam is 2 units (was 4), a pouch keeps half a unit from a cell or Section wall, and the corner radius is a constant 18 % of the short side (the old compression rounding turned every cell-shaped rect into a capsule with voids at the corners); the divider seams draw at the shell outline's own weight. Third pass (Ivan's circled corners): the pouch outline is no longer a rounded rect pulled to the walls (kinks where a pulled run met a free one, tips wherever the shell met a seam); it is the compartment itself — the shell inset by its seam, cut to the cell or Section walls and the pouch rect — OPENED by a disc of the pouch radius (`lib/spatial-fillings/opening.ts`: two exact distance transforms on a small grid, the boundary traced back), so every convex corner rounds at that radius, nothing thinner than the pouch survives (the fill under a notch rounds off the way stuffing does) and concave walls are followed as they are. Depth offset per layer = thickest piece's `thicknessMm × k × FORESHORTEN`, clamped so the deepest slab stays in the cell. Compression is slice 03; here a layer wider than the cell is simply clamped to the cell width pro rata (so nothing overflows visually yet).
- **Retire** `itemScales`, `itemScaleMap`, `sizeScale` and `SIZE_SCALES`. Move their tests. *Built:* the bolster keeps its weight-based pack (slice 09 gives it true scale) with the registry's `widthMm` as the weight, so nothing relative survives.
- **`XrayPillow` props:** `pillowSize` and `itemDims: ReadonlyMap<number, ResolvedDims>` join `itemSizes`, which stays for the piece labels only (the size written inside a pouch is the Item's, not a scale). `XrayEditor`'s `useItemMaps` derives `itemDims` from `items` via `resolveItemDims(items, registryFromPayload(dimensionOverrides))`; `mp-config-client` derives it in the same memo as `assistItemSubtypes` / `guestItemSubtypes`. Read-only mode (no `items`, no change handler) is unchanged. *Built:* the geometry lives in `lib/spatial-fillings/xray-stage.ts` (`stageGeometry(size)`: `k`, silhouette path and polygon, `colX` at the divider seams, `rowY` as thirds of the body, the nine cell regions on a straight grid — the two column dividers are the protector's seams, drawn on the x-ray since the 26-9-2026 review — the three Section hit paths), built once per Size; the renderer memoises its conform regions per Size in `stageRegions`. The configurator's shell path is the same stage path, so the shell and the x-ray cannot misalign.
- **Hosts** pass the **Size**: configurator (assist and guest), Configure card page, **Result** assign, rules-engine preview. Fallback M with a `ponytail:` note if a host truly cannot know it. *Built:* every route that ships colour overrides (assist, shop customize, mp-basic recommend, the two Configure template routes) ships `dimension_overrides` / `dimensionOverrides` beside them via `loadDimensionOverrides` (slice 12's plumbing lands here); the assist panel surfaces them with `onDimensionOverridesChange`; there is no separate rules-engine preview mount.
- **Neck support** uses `NECK_SUPPORT_DIMENSIONS`; the pill outline in `conform.ts` takes its rect from the layout and drops the `long / 2.2` cap. *Built:* the pill is the layout rect (the registry's Neck support footprint), full length, ends round.
- **Mbolster** keeps today's packing in this slice (slice 09 gives it dimensions).

## Acceptance criteria

- [x] vitest: one pouch renders at `widthMm × k` by `lengthMm × k` (±0.1) centred in its cell; two pouches that fit side by side keep their footprints and do not shrink each other; a pouch renders larger on XS than on XL in view units; `along` swaps the axes; a longer pouch clamps to the cell.
- [x] vitest: every existing layout invariant still holds — disjoint pieces, inside the frame, stable keys, deepest-first emission, identical output regardless of input order.
- [x] vitest: depth offset grows with the layer's thickness; five layers of the thickest filling still keep the deepest slab inside the cell.
- [x] `xray-pillow.check.ts` still passes: no `<rect`, no hard-coded paths, nested clipping intact (its size-scale assertions became stage and registry assertions; `xray-dive.check.ts` follows the renamed geometry).
- [x] vitest: the stage path for each **Size** is the registry `outline` × `k` (bounding box ±0.1), with the notched front edge at the top; switching **Size** changes the silhouette's proportions.
- [x] vitest: the column boundaries sit at the registry's section widths × `k` (XS: 204 and 399 mm × `k`, ±0.1); XL's are thirds.
- [x] The configurator (Staff and guest), Configure card page and **Result** assign all pass `pillowSize` and the dimension overrides, and `surface-parity.check.ts` asserts both.
- [x] `sizeScale` / `SIZE_SCALES` / `itemScaleMap` no longer exist; `grep` finds no caller.
- [x] Shopper preview gains no edit affordance (read-only detection unchanged).
- [x] `./scripts/graphify update .` run and committed.

## Revision (2026-09-28): fillings scale with the pillow Size

Ivan: compartments and Neck support must be relative to the pillow Size — XS and XL scale their fillings too, shown on the same pillow view. Built as one door, `dimsAtSize(dims, pillow)` in `dimensions.ts`, which `fitPillow`, `settlePillow` and `layoutPlacements` all read pouch dimensions through, so the drawing and the budgets cannot scale apart:

- **Reference Size M.** Every pouch and Neck support entry — code default or Settings row — is the piece in a Size M pillow (Product Visualize now says so). `sizeFactors(pillow)` gives each Size's ratios to M from the drawings: across = pillow width, along = body length, thickness = side gusset. `pouchAtSize` applies them per axis by orientation (min width, min thickness and the flat limits follow). M is identity, so no M number changed.
- **Why this is the cheap, exact form for the x-ray.** The stage is the pillow at every Size (`k = view width / pillow width`), so a scaled pouch draws at `w_M × (W/W_M) × (view/W) = w_M × view/W_M` — a Size-independent fraction of the pillow. XS and XL read alike, as the pillows do, and only the Section dividers (from the drawings) move. The factors are three divisions per Size; `dimsAtSize` memoises per item per fit.
- **Fit.** Thickness scales with the gusset exactly as the loft budget does, so a stack that fits at M fits at every Size by loft; width can still differ where a Size's Section proportions do (XS's centre is 195 of 604 mm, M's 260 of 706). `fitAtSizes`' dots therefore mostly agree across a template's Size membership.
- **Offsets** (slice 08) are M millimetres too, so a pouch pushed to the outer edge stays there at every Size.
