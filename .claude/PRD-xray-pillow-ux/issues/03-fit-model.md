# 03: Fit model — per-Layer width and per-cell loft budgets, compression limits, fit status

Tracker: #203 · Parent: #200

**Type:** AFK
**Blocked by:** 01, 02
**User stories:** 8, 9, 10, 11, 13, 22
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`

## Goal

"Does this mix fit this pillow?" has one pure, deterministic answer, with numbers, that the renderer, the gauges and the cross-section all read from the same object.

## The gap, precisely

- No module knows loft. `packDepthStack` fakes depth; nothing sums thickness or compares it to a maximum.
- Width is never budgeted: `packRows` divides whatever width there is.
- The caps in `core.ts` (`MAX_PIECES_PER_LAYER = 5`, `MAX_LAYERS_PER_CELL = 5`, `MAX_PIECES_PER_CELL = 25`) are schema ceilings with matching DB checks; they must stay, but they are not the real limit.

## Scope

- **`lib/spatial-fillings/fit.ts`** (new, pure):
  - `FitStatus = "ok" | "compressed" | "over"`.
  - `fitLayer`: relaxed width = Σ `widthMm` + seams; available = the **Section** width for the **Size**; squeeze shared pro rata by each piece's `widthMm − minWidthMm`; `widthRatio` per piece; status.
  - `fitCell`: relaxed loft = Σ per-layer max `thicknessMm`; min loft = Σ per-layer max `minThicknessMm`; max = `maxLoftMm[section]` (the centre is one inch lower than the sides); compression shared pro rata by each layer's compressible range; `thicknessRatio` per layer; `loftMm`; status.
  - `fitPillow(placements, ctx): { cells, sections, status }` — `sections` carries per-**Section**, per-**sub-section** loft for the cross-section.
  - `wouldFit(placements, change, ctx)`: the same function on the hypothetical result; `change` is an add or a move.
  - `fitMessage(cellFit, size)`: `"center · middle: 3 layers need 95 mm relaxed, 70 mm fully compressed; Size M holds 60 mm"`.
  - `ponytail:` pro-rata compression is the simplest deterministic rule; foam is non-linear; slice 10 calibrates.
- **Layout** reads the fit: rect width × `widthRatio`; depth offset × `thicknessRatio`. `layoutPlacements` takes the fit in its `ctx` (computed once by the caller) rather than recomputing.
- **Renderer memo:** one `useMemo(() => fitPillow(...), [placements, pillowSize, itemDims])` in `XrayPillow`; the geometry chain reads it. No second polygon scan.
- **`fitBolster`** is slice 09; export the type now so the bolster renderer compiles against it later.

## Acceptance criteria

- [ ] vitest: relaxed → `ok` with ratios 1; over-wide but squeezable → `compressed` with Σ (width × ratio) + seams = available (±0.1) and no piece below `minWidthMm`; over-wide beyond minimums → `over`.
- [ ] vitest: the same three cases for loft across layers; pro-rata sharing sums exactly to `maxLoftMm[section]`; the same stack that is `ok` in a side Section can be `compressed` in the centre.
- [ ] vitest: `fitPillow` is input-order independent and byte-identical across two calls; `wouldFit(add)` equals `fitPillow(applied)`.
- [ ] vitest: `fitMessage` renders the three numbers and the **Size**.
- [ ] vitest: `addPiece` still refuses at the legacy caps before the fit is consulted (ceilings unchanged; `core.ts` untouched).
- [ ] `xray-pillow-geometry.test.ts` extended: the conformed outline of a compressed piece stays inside the same regions.
- [ ] Devtools spot-check noted in the PR: at 17 pieces the fit adds < 1 ms to the memoised chain.
- [ ] `./scripts/graphify update .` run and committed.
