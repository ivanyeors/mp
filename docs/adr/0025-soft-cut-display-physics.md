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

## Amendment: the top-down x-ray settles too (1-11-2026)

Ivan: the top view should use the soft body as the side view does, with the side view's
configuration left as it is. The x-ray now draws its pouches with the same solver and the same
Settings (`components/spatial/soft-top.ts`):

- **Same feature, seen from above.** Each **Layer** of a **Section** is one plane, settled on its
  own: pieces of a **Layer** press on each other, a **Layer** under them does not push them aside.
  The walls are silhouette ∩ **Section** (in the dive, silhouette ∩ cell). Rigidity, Neck
  firmness, pouch volume, smoothing, space between pieces, settle length, animate and on/off all
  apply; empty case height is the cut's alone (seen from above the case has no height to slump).
- **Three solver options, off by default.** No gravity (it points into the screen), a rigid case
  (`rigidCase`: the sewn walls do not move) and a tether up ↔ down as well as front ↔ back
  (`tetherY`). The cut passes none of them, and its output is byte-identical before and after
  (420 recipe × Size × Section × layout × Settings scenes hashed). The signed-distance grid is
  built on first use, which a rigid case never reaches.
- **The layout still decides where.** Rects, **Layers** and squeezed widths are
  `layoutPlacements`'; the soft settle starts from the conformed outlines and decides only shape.
  A pouch remembers the codebase footprint (`pouchOutline`) at its volume; a plane holding more
  than its room is squeezed pro rata first; a **Neck support** is the firm roll, its footprint the
  pill. Hit areas, labels, the selection ring and the drag ghost read the soft outlines.
- **Cost.** A plane is 15–45 ms, a pillow up to ~10 planes. The first two unsettled planes settle
  in render (an edit's, so it never flickers); the rest settle a few steps per frame and arrive
  together — the solver's split invariance makes that the same picture. Cached per plane, so a
  change in one **Section** settles that **Section**'s planes alone.
- **What reads differently.** A top **Layer** spreads to the walls, so a wider piece under it no
  longer peeks out at the sides (Neck mix: the Neck M roll in the centre).

## Amendment: a nudged pouch stays where it was put (1-11-2026)

Ivan: both views must still allow small, precise placement, the fillings still separated by
their columns. Measured first: where a pouch had room, both soft settles followed a nudge to the
millimetre; in a full cell its neighbours pushed it about half way back (the top view showed
20 mm as 11–15 mm, the cut as ~10 mm, and the cut shrank the pouch instead of moving it).

- **Held, not pushed back.** A piece nudged by hand (a non-zero fine offset; front ↔ back in the
  cut, either way from above) is `held`: its tether is `HELD_TETHER` (0.5) instead of the loose
  0.05, so its neighbours make room. Contacts still resolve after the tether in every substep,
  so it never runs into them. Un-nudged pieces are untouched: the 420 cut scenes and 42 top-view
  scenes hash identically before and after.
- **It slides within its columns.** The settle used to cut a nudged pouch to the columns it
  spans, so pushing it at an occupied neighbour shortened it. A nudged pouch now keeps its length
  and stops at its columns' edge (`extentIn` in `settle.ts`): it moves exactly as far as its own
  columns have room and never stands in an occupied neighbour's column. A pouch as long as its
  column, between full neighbours, has no room front ↔ back; it can still be nudged across from
  above.
- **The cut places too.** A drop on the cut lands centred where it was let go — in its own
  Layer, another Layer or another column — as far as its columns have room
  (`placeSlabDrop`); Alt + ← / → slides it 5 mm (`nudgeSlab`), saying so when it has no room.
  Both write the same `offset_y_mm` the top view writes, in Size M mm.

## Amendment: the Ear Comfort Pad (4-11-2026)

Ivan: an Ear Comfort Pad added to a Filling Template should be configurable in Soft body and show
its shape in the x-ray, as the fillings do. It is placeable on the Neck support's terms (premium
pillows only, its own MSRP per piece; `isInPillowAccessory`), and drawn as a third shape:

- **Its own body kind.** The solver's `pad` is firm the way the roll is — volume that gives under
  load, a floor, spring-back, a cap on how far it squashes out of shape — at its own firmness
  (`padFirmness`, Settings "Ear pad firmness", default 60). Its skin smooths toward its own rest
  curvature, not toward flat, so surface tension takes ripples and leaves the sewn well. Pouches
  and rolls run the same arithmetic as before.
- **Side-on**, it is the codebase cushion with its top dipped by the well (`wellDip`: the full
  depth across the sewn floor, a cosine rise to the rim), seeded and remembered so; with the soft
  cut off the slab draws the same dip. **From above**, it is a firm pad whose footprint is a
  puffy square (corner 0.3 of its short side), and the x-ray draws the well on it as a shaded ring
  at its centroid; its label moves beside the ring.
- **The well is a setting, not a dimension.** Its size (share of the pad's width, default 32 %)
  and depth (share of its thickness, default 55 %) are Soft body settings, read from the product
  photo; they draw with the soft cut on or off. The pad's own size is a Dimensions row
  (`ear/one-size`, a 180 × 180 × 40 mm fallback until measured).
- **Saving from an older page** that predates the three knobs keeps their stored values; it does
  not reset them.

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
