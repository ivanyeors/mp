# 08: Fine nudge — persisted millimetre offsets, visual-only, out of the fingerprint (optional, gated)

Tracker: #208 · Parent: #200

**Type:** AFK — **gated:** build only if the slice 10 sign-off finds cell × Layer × order too coarse for what the build team needs to see
**Status:** built 28-9-2026 ahead of slice 10, at Ivan's request (true-scale pouches leave free space; he wants to place a small pouch in it). Migration `20260928090000_filling_placement_offsets.sql` needs `supabase db push` **before** this code deploys — every placement reader now selects the two columns.
**Blocked by:** 06, 10 (the decision)
**User stories:** 41, 42, 43
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:storefront`

## Goal

Record "pushed to the outer edge" as a few millimetres, deterministic, persisted, and invisible to the pack list, COGS and the fingerprint.

## The gap, precisely

- After slice 02 a pouch no longer fills its cell, so there is free space in a cell and no way to say where in it the pouch sits.
- `filling_template_placements` and `result_filling_placements` carry `row_index` and `insert_order` as visual / assembly-only columns (`20260721000000_filling_placement_row.sql`, `20260915000000_filling_placement_insert_order.sql`); the pattern for another such column exists.
- `canonicalizePlacements` (`core.ts`) keys on cell and item ids only, so a new column is outside the fingerprint by construction — a test must pin that.

## Scope

- **Migration:** `offset_x_mm smallint`, `offset_y_mm smallint`, nullable, `check (abs(v) <= 200)`, on both pillow placement tables. Bolster untouched. Applied with `supabase db push`, never the MCP apply.
- **Types and mapping:** `PillowPlacement.offsetXMm?` / `offsetYMm?`; `rowsToPillowPlacements` / `pillowPlacementsToRows` carry them like `row` and `insertOrder`.
- **Readers and writers:** the assist route, the Admin template route and the **Result** assign route select and accept them; `api-contract.check.ts` asserts every reader selects both (the `row_index` contract grows two columns).
- **Layout:** offset × `k` applied after centring, then clamped so the footprint stays inside cell ∩ silhouette minus the seam; the conform pass deforms at the shell as today.
- **Interaction:** with a piece selected (slice 06), Alt + arrows, or the pad's **Fine** toggle, nudges 5 mm; Undo as for moves.
- **Settled view:** the nudge is the anchor — when a pouch cannot fill its void it decides which end the gap sits at; when it can, the nudge is absorbed and the settled piece reads unchanged.
- **Fingerprint:** a test asserts `fingerprintPlacements` and `placementsExactMatch` are unchanged with and without offsets; `sessionTemplateId` therefore does not clear on a nudge.

## Acceptance criteria

- [x] The migration is additive and nullable; existing rows read back unchanged.
- [x] vitest: a nudge that would cross the cell boundary or the shell seam is clamped; the clamp is deterministic.
- [x] vitest: with a void larger than the pouch's spread capacity, a back nudge puts the gap at the front and a front nudge puts it at the back; with a void it can fill, the settled rect is the same for every nudge.
- [x] vitest: fingerprint and exact-match are byte-identical with and without offsets; the pack list ignores them.
- [x] `npx tsx lib/spatial-fillings/api-contract.check.ts` asserts the two columns on every pillow **Placement** reader.
- [ ] Alt + arrows (and a drop inside the pouch's own cell — there is no Fine toggle, the pad went 27-9) nudge the selected piece and the value persists through save and reload on Configure, **Result** assign and a Staff-assist hold. *(Wired: every reader and writer carries the columns and the migration is applied. Browser check for Ivan on a deployed build.)*
- [x] `./scripts/graphify update .` run and committed.

## Build notes (2026-09-28)

- **Drawn at true scale first.** Slice 02's 26-9 "fill the compartment" amendment is retired for the pillow (Ivan, 28-9: a small filling must read smaller than a large one and must not stretch to fill the space). `packTrue` in `xray-layout.ts` draws each pouch at its footprint × the fit's squeeze, the layer's row centred in its slab; the Mbolster keeps `packFill`.
- **Offset = mm from home, clamped to the room the neighbours leave.** Each `PieceLayout` carries `home` (its un-nudged corner) and `range` (the corners it may take); a pouch moved into a neighbour pushes it along, so slot order and seams hold. The renderer stores what it draws: a drop or Alt + arrow clamps to `range` before `nudgePiece` writes mm.
- **Interaction.** No pad and no Fine toggle (the pad went 27-9): a pouch dropped back in its own cell goes where it was let go (`planPouchDrop` → `nudge`); in a side-by-side row a drop that passes a neighbour is still a reorder. Alt + arrows nudge 5 mm (`nudgeKeyFor`). One toast id for moves and nudges, so a run of nudges updates one toast whose Undo is the latest.
- **Moves and mirror.** `movePiece` keeps the offset inside its cell (a Layer change) and drops it in a new cell; `mirrorSection` negates x, so a pouch pushed to the left's outer edge lands at the right's.
- **Settled view.** Settle spreads a pouch into an empty neighbouring sub-section by volume (slice 11), from its true-size, nudged rect, so a small pouch no longer fills its compartment. *Built 29-9:* the nudge is the anchor. `anchorAlong` turns the front ↔ back offset into where the pouch sits in its cell's free length (0 front wall, ½ home, 1 back wall), and `offerBothWays` weights the front and back voids by it. A pouch pushed back spreads back and leaves the gap in front, and the other way round; at home it is exactly the old pro rata split; a pouch that can fill both voids fills both whatever the nudge. A pouch as long as its cell has no free length and stays at home.
- **Contract.** `api-contract.check.ts` now requires `offset_x_mm, offset_y_mm` beside `row_index` in every pillow Placement reader and a `MAX_OFFSET_MM` zod gate on every write path; it also pins fingerprint / exact-match invariance and the row round-trip. (It also exempts the reconfigure route's template read, which only feeds `decideFillingAssign` — that assertion was failing on the branch before this slice.)
