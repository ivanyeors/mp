# X-ray filling visuals: clipped fluid SVG, legible piece count

The **X-ray filling editor** renders **Placements** as designer-authored fluid SVG paths (one per filling type, recolorable), conformed to the pillow by clipping against designer-exported region paths (silhouette ∩ **cell**). Shape transitions use `flubber` path interpolation. We deliberately rejected rect/bounding-box cropping, gooey-filter merging, procedurally generated blobs, and WebGL for v1.

## Guardrails (implementation must-holds)

1. **No box cropping.** Every filling shape is clipped only by designer-authored curved region paths (`<clipPath>` from the exported SVG: silhouette and 9 cell boundaries). A visible straight clip edge that isn't a designed section divider is a bug.
2. **Piece count stays legible.** Multiple pieces in a **cell** compress — scale down, squish, overlap slightly — but each keeps its own outline (two microfibre pouches read as two pouches). Never merge pieces into one indistinguishable mass; this is why the gooey filter was rejected as the default treatment.
3. **Deterministic rendering.** Same placements → identical visual (fixed slot layout per piece count, 1–5). No randomness; Staff must be able to compare the x-ray against the physical build.
4. **Morphs are prepared, not ad hoc.** `flubber` interpolations run between normalized path pairs precomputed at load, animate transform/`d` only (no layout thrash), and fall back to a crossfade if a pair degenerates (self-intersections, flicker). Target 60fps on a mid-range tablet.
5. **One asset pipeline.** Filling shape paths and region paths come from the designer SVG export, inlined (not `<img>`), tagged `data-item-subtype`, colored via CSS variables. Shape defaults live in a code config map; **color** is editable per filling **Item** in **Product Builder**. No parallel hard-coded shapes in components.

## Considered options

- **Gooey/metaball filter merge** — rejected as default: hides how many pieces are in a cell (guardrail 2).
- **Generated blobs (`blobshape` etc.)** — rejected for v1: designer-authored shapes are the brand look; generation adds nondeterminism.
- **WebGL / three.js cutaway** — rejected: overkill for a 3×3 grid editor; harder touch/a11y (see ADR 0008 context, Q16).
