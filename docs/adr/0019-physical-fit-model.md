# The x-ray has a physical fit model: measurements in millimetres, fit derived on read

The x-ray draws every filling **Placement** at its real footprint relative to the pillow **Size**,
and answers "does this mix fit this pillow?" with a number. One pure registry
(`lib/spatial-fillings/dimensions.ts`) holds every measurement in millimetres; one pure fit
model reads the **Placements** plus the registry and reports, per **Layer** and per **cell**, a
**Fit status** of `ok`, `compressed` or `over`. Nothing about fit is ever stored: like the
**Spatially authored** status it is recomputed on every read, so the pack list, the fingerprint
and **Promote** grouping cannot see it and cannot change.

## Decisions

- **Pillow geometry is code, from the drawings.** The silhouette is the finished M bottom panel
  traced from the 2018 case drawing (Ivan, 25-9-2026: the M shape for every **Size**, no neck
  tab), scaled to each **Size**'s width and body length; **Section** widths come from the
  protector's divider seams; heights from the "Cover Side" strip (4''–8'') with the centre
  **Section** one inch lower. These are facts of the product, not settings, so they are not
  editable anywhere.
- **Pouch, Neck support and bolster dimensions ship as code defaults with Settings overrides.**
  The same split ADR 0009 uses for colour: a row in `filling_dimension_overrides` or
  `neck_support_dimension_overrides` wins, no row means the code value, Reset deletes the row.
  The loft allowance (how much the cloth gives, 10 % by default) is a site setting the same way.
  An entry nobody has measured resolves as a `fallback` — a plausible family-sized pouch — and
  is labelled so wherever it is shown; it is never presented as measured.
- **Fit is derived, never persisted.** `fitPillow(placements, registry)` is pure and
  deterministic; every surface computes it once in the same memo the layout uses and passes the
  result down. No column, no cache, no job.
- **Compression is shared pro rata.** When a **Layer** is wider than its **Section**, or a
  **cell** taller than its loft budget, the squeeze is shared across pieces (or **Layers**) in
  proportion to each one's compressible range (`relaxed − minimum`). Foam is not linear; this is
  the simplest deterministic rule, and the calibration sign-off (slice 10) measures how far off
  it is before anything cleverer is considered.
- **Advisory, not blocking.** An `over` cell warns and asks for a confirm on save or hold; it
  never refuses. Staff meet edge cases with real-world workarounds, and a refusal would push
  them off the x-ray.
- **Natural settle is a display-and-fit pass.** Fill spreads into an empty neighbouring
  **sub-section** of the same **Section** and **Layer**, thinning by volume, on screen and in
  the loft arithmetic. It never rewrites which **cell** a pouch was put in.

## Considered options

- **Dimension columns on `items`** — rejected. They would be typed once and drift; the registry
  keys off the same descriptor normalisation the picker uses, so one pouch has one entry however
  inventory spells it, and Settings overrides give the editable half without a schema change to
  inventory.
- **Everything in the database, no code defaults** — rejected. A fresh environment would draw
  nothing until someone typed twenty rows, and the pillow geometry would be one accidental edit
  away from wrong. Code defaults plus overrides means every environment draws, and only the
  values that are genuinely business data are editable.
- **Persisting the fit** — rejected. It is a function of the **Placements** and the registry;
  storing it invites the two to disagree, and nothing needs to query it.
- **A physics or soft-body model** — rejected (ADR 0009 stands). Rectangles, thicknesses and
  volumes answer the question staff actually ask; the calibration slice decides if that is
  enough.

## Consequences

- `dimensions.ts` is the only place a millimetre lives. `resolveDims(item, registry)` never
  throws and never returns undefined; the x-ray cannot blank on a new **Item**.
- Every x-ray host passes the pillow **Size** and the dimension overrides alongside the colour
  overrides it already loads; `surface-parity.check.ts` asserts it.
- A changed override changes every x-ray's fit on the next load, with no deploy — which is the
  point, and also why an unmeasured entry must say so on screen.
- The legacy caps (5 per **Layer**, 5 **Layers**, 25 per **cell**) stay as schema ceilings behind
  the fit model; the database constraints and the validator do not change.
