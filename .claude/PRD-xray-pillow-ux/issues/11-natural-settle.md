# 11: Natural settle — fill spreads into an empty neighbouring sub-section, on screen and in the loft arithmetic

Tracker: #212 · Parent: #200

**Type:** AFK
**Blocked by:** 02, 03. Build before 04 and 05 so they are written once against settled geometry (the fit object is the contract, so they do not change shape if this slips).
**User stories:** 50–62
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** built (PR #213) — `lib/spatial-fillings/settle.ts`, `__tests__/settle.test.ts`; `fitPillow` judges per column on settled thickness and carries the settle; the layout adds a settled rect per piece; `XrayPillow` draws settled everywhere but the dived Section, with the ghost and the morph.

## Goal

Fill the center middle and leave the back empty, save, and the x-ray shows what the chamber does: the pouch spreads back, thins in proportion, and the void is gone — while the **cell** it was put in stays exactly where it was authored, and every move and nudge keeps acting on that cell.

## The gap, precisely

- `xray-pillow.tsx` conforms every piece against `[SIL_REGION, CELL_REGIONS[key]]` and clips it with `CELL_CLIP_PATHS[key]`: a pouch stops dead at the **sub-section** divider. An empty neighbouring sub-section renders as a void no built pillow has.
- A **Section** is one chamber (CONTEXT.md; **Insert order** is per Section, sub-sections are positions along it). Only the Section walls are walls.
- After slice 03 the loft fit is per cell on authored rects, so a stack that would spill into an empty back is judged as if the back were not there.
- Slice 02 gives each pouch a footprint and slice 01 a `thicknessMm` / `minThicknessMm`; volume is therefore known, and so is how far a pouch can spread before it is fully compressed.

## Scope

- **`lib/spatial-fillings/settle.ts`** (new, pure): `settlePillow(layout, ctx)` — authored rects in, settled rects (with settled thickness) out.
  - Per **Section** × **Layer**: empty sub-sections form voids; each void is claimed by the occupied sub-section(s) touching it; every claimant piece spreads along y into the void up to `min(void length, capacity)`, capacity = `V / (widthMm × minThicknessMm) − lengthMm`, capped by `flatLengthMm` when the registry has it.
  - A void touched from both ends splits pro rata by capacity; the two pouches meet at one seam and stay two rects.
  - Settled thickness = `V / (widthMm × settledLengthMm)`, floored at `minThicknessMm`.
  - A pouch that cannot fill its void leaves the remainder at the end its anchor (authored position + nudge) says.
  - Never across a Section wall, never across a Layer, never into a sub-section holding a piece of the same Layer. `subSectionDividers: true` on the Size → identity (it is `false` for every pillow Size: the 2018 protector drawings wall the three Sections and nothing else, PRD Further Notes).
- **Pipeline:** `layout → settle → fit → render`. `fitPillow` reads settled rects and thickness; a settled pouch contributes to every sub-section column it spans (the cross-section reads that).
- **Renderer:**
  - Settled is the default view: shopper preview, **Result** read-only, Configure, and every Section not being dived.
  - The dived Section draws authored rects (crisp cells; drop targets and the move pad refer to them) with the settled outline under each piece as a dashed ghost.
  - Leaving the dive morphs authored → settled: interpolator prepared once per transition via `prepareMorph` (degeneracy-checked, crossfade fallback); `d` and opacity only.
  - Settled pieces conform against silhouette ∩ Section (`SECTION_HIT_PATHS` polygons, seam = `GAP`) instead of the cell polygon; sub-section dividers are faint guides drawn only in the dive.
  - Labels sit at the settled centroid; selection shows the authored cell ring and the ghost together.
- **Mbolster:** the same rule in one dimension along the capsule (slice 09 wires it).
- **Writes nothing.** `PillowPlacement`, pack list, fingerprint, **Promote** grouping untouched.

## Acceptance criteria

- [x] vitest: one pouch in center/middle with front and back empty spreads both ways to its capacity, thins to `V / (w × l')`, never below `minThicknessMm`, and stays inside the Section.
- [x] vitest: front and back occupied, middle empty → both spread, meet at one seam split pro rata, and remain two rects; a pouch with capacity smaller than its void leaves the gap at the far end (its authored position is the anchor; slice 08's nudge will move it).
- [x] vitest: nothing crosses a Section wall or a Layer; `subSectionDividers: true` returns the input; the pass is input-order independent and byte-identical across two calls.
- [x] vitest: `fitPillow` on the settled result reports a lower middle loft and a non-zero back loft for the spill case; a stack `compressed` on authored rects with an empty back behind it is `ok` once settled. *Amended:* `over` cannot flip by settling under this model — the fully compressed floor (Σ `minThicknessMm`) is volume-invariant, so a stack whose minimums exceed the budget stays `over` however far it spreads; the test pins that too.
- [ ] Configure: author center/middle only, save, reload — the pouch is drawn spanning middle and back; dive into center — it snaps to its cell with a dashed ghost where it will settle; Done — it morphs back. *(Browser check for Ivan: wired, not yet seen on a deployed build.)*
- [x] The shopper preview and **Result** read-only render settled; no edit affordance appears (a read-only x-ray never dives, so it never computes an authored outline).
- [x] Adding or removing a piece in a sub-section a neighbour had settled into pushes that neighbour back to its own cell (moves arrive with slice 06 and go through the same re-derive); the pack list and the fingerprint are unchanged by any of it (test on `placementsExactMatch`).
- [x] `xray-pillow.check.ts` extended: settled pieces conform against the Section region; the ghost is a dashed stroke of the same path; the transition goes through `prepareMorph`. Still no `<rect`.
- [x] `./scripts/graphify update .` run and committed.

## Build notes (2026-09-25)

- **Pipeline as built:** `fitPillow` calls `settlePillow` first and carries the result (`fit.settle`); the layout reads the fit for the squeeze ratios *and* the settle for each piece's settled rect and settled thickness. One memo in `XrayPillow`, as the PRD asked; the renderer never recomputes settle.
- **Per-column loft.** A sub-section column's stack is every piece whose settled span covers it, one plane per depth (a neighbour's fill that spread in at another plane counts). A piece draws at the tightest ratio of the columns it spans; `loftBySubSection` is what each column then stands at. `CellFit.loftLayers` is the column's plane count (the message reads it); `CellFit.layers` stays the cell's authored Layers (the width fits).
- **Offers are capped at the void.** A pouch offers `min(capacity, void length)` to a void; a void claimed from both ends splits `void − SEAM_MM` pro rata by the two offers, so the seam is a real 2 mm gap and neither claimant is credited with more than the void.
- **`over` does not flip.** See the amended criterion: settling lowers the relaxed loft, never the fully compressed floor, so `compressed → ok` is the reachable relief; `over` needs fewer or thinner pouches. Slice 04 should say so in its message.
- **Views in the renderer.** Pieces are grouped per Section (Section clip inside the silhouette clip); the dived Section adds the cell clip on the same elements, so a piece keeps its tree position across the flip and `MorphPiece` morphs `d` from the outline it had in the other view (`prepareMorph`, crossfade fallback). Authored outlines are computed for the dived Section only, so a read-only x-ray pays for one conform pass, as before.
- **Mbolster** keeps its one-dimensional layout; slice 09 gives it the same rule along the capsule.
