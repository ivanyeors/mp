# The cross-section draws a soft-body settle; the fit model still decides where everything goes

Status: Accepted (PRD `xray-soft-cut`, 2026-10-18)

The cross-section used to draw each piece as a rounded slab: a box at the fit's thickness,
domed, pressed into the case and draped where nothing holds it up. Ivan's brief (Oct 2026): the
side view should show fillings as they are — soft, morphing to fill the space, stacked from the
bottom up as they are added, never floating — and the case should behave as cloth, flexible, not
standing to its full height when empty, while keeping the designed outline as closely as it can.
A testing preview, built against the codebase's own fit model, cut model, cushion shapes and
Center outline, and checked against the brand Type 8–11 diagrams, settled on a soft-body settle
that does this. This record admits it, as a display layer only.

## Decisions

- **Display physics, not fit physics.** The fit model (ADR 0019) still decides each piece's span
  front ↔ back, its **Layer**, its thickness and whether its **cell** closes, and the loft numbers,
  the **Fit status**, the pack list and the fingerprint read only it. The soft cut reads the fit
  and decides one thing: the shape each outline takes once the pieces press on each other and on
  the case. It never feeds a number back. ADR 0019's "a physics or soft-body model — rejected"
  stands for the fit; it no longer stands for the drawing.
- **Gravity first.** Pieces are stacked one **Layer** at a time from the back panel up — a cell's
  deepest **Layer** is its bottom — so nothing can float and the stack grows from the bottom as
  pieces are added. Pieces of one **Layer** share what is under them and never hold each other up.
  A cell holding more than the case has room for is squeezed first, pro rata by compressible
  range, the fit's own rule.
- **A pouch is cloth around fill.** Each pouch is a ring of fixed-length fabric held out by
  pressure (an area constraint, never below its minimum), with surface tension and a weak memory
  of the codebase's own cushion shape (`puffyPath`) — a pouch stacked over something uneven
  remembers the cushion too, not the drape it started in, so it rests on what is under it. A
  **Neck support** is a firm soft body (Ivan, 18-10-2026): foam in a cover that does not stretch,
  round when free, flattening a little where it rests and where a pouch presses on it — how
  little is its own Settings knob. Set soft, it also shares a crowded cell's squeeze with the
  pouches, as far as its fully squashed radius, and flattens into a stadium (Ivan, 18-10-2026). Pieces keep a gap between outlines, so ADR 0009's legible
  piece count holds — no merging, ever.
- **The case is cloth.** It may go slack (never longer than sewn), is drawn lightly toward a
  slumped copy of the designer's outline, keeps that outline's curves, bends smoothly, never
  billows more than 1.5 view units past the sewn line, and lies on its flat bottom. Under-filled
  it sags below the sewn outline, which is drawn faint behind it; a full recipe stands it to its
  sewn shape.
- **Deterministic.** XPBD with a fixed start, a fixed number of steps, no randomness and no trig
  in the loop: the same recipe and Settings give the same picture on every device, and how the
  steps are split never changes the result. ADR 0009's guardrail 3 holds.
- **Shown eased, not solved on screen.** The settle is computed in one go (and cached); a change
  eases every outline from where it was — a new piece from where it was stacked — to where it
  settles, over the settle's length. Stepping the solver on screen was tried and dropped: its
  early steps (cloth falling on pouches not yet inflated) are half-solved, pinched shapes.
- **Smooth by construction.** The cloth resists kinks its sewn outline does not have, and what is
  drawn is evenly respaced and low-passed (Taubin λ 0.5 / μ −0.53, shrink-free). No wobbly lines.
- **Tuned in Settings, one value everywhere.** Staff tune a few physical knobs (rigidity, pouch
  volume, empty case height, smoothing, gap, settle length, animate, on/off) at Settings →
  Inventory → Configure → Soft body, previewed live, saved as one `site_settings` row
  (`xray_soft_body`, JSON). It reaches every x-ray host through the dimension payload that already
  carries the loft allowance, so Staff, the build team and shoppers see the same cut. Off draws
  the rounded slabs, as before.
- **Hand-written, browser-side.** ~500 lines of typed-array TypeScript in
  `lib/spatial-fillings/soft-body.ts` (solver) and `components/spatial/soft-cut.ts` (seeding and
  the hook), 15–45 ms per recipe on the main thread, cached per recipe.

## Considered options

- **Keep the rounded slabs** — rejected. A slab cannot fill the space it is given, and the drape
  rule counts **Layers** from the top, so a pouch can rest on the plank of a neighbour and read as
  floating.
- **A physics library** (matter.js, planck, box2d, p2) — rejected. Rigid bodies cannot morph; soft
  bodies there are spring meshes that jitter, are not deterministic across step splits, and add
  100 kB+ for one drawing.
- **Mass-spring soft bodies** — rejected after the spike: they balloon, cross over and wobble.
  Pressure + fixed-length fabric + shape matching is what holds a cushion.
- **Physics in the fit** — rejected (ADR 0019 stands). The numbers staff budget with stay
  arithmetic over thicknesses and volumes.
- **WebGL / canvas** — rejected. SVG keeps the cut's hit-testing, focus, labels, theme variables
  and static server render.

## Consequences

- A static or server render (and every `renderToStaticMarkup` test) draws the rounded slabs; the
  soft shapes replace them in the first client layout, before paint.
- Hit-testing still reads the fit's bands (`AlongSlab`), not the drawn outlines; a soft piece sits
  close to its band, but not exactly on it.
- The fit's settle still counts **Layers** from the top. The soft cut lets a pouch spread only into
  columns that are empty, where the two agree; moving the settle to count from the floor changes
  the fit's millimetres and is its own decision.
- Pouch volumes are fallbacks until measured; the "Pouch volume" knob (default × 1.30) covers the
  difference and should come down as real measurements land.
- The Bolster cut is unchanged.
