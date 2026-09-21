# 08: Fine nudge — persisted millimetre offsets, visual-only, out of the fingerprint (optional, gated)

Tracker: #208 · Parent: #200

**Type:** AFK — **gated:** build only if the slice 10 sign-off finds cell × Layer × order too coarse for what the build team needs to see
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

- [ ] The migration is additive and nullable; existing rows read back unchanged.
- [ ] vitest: a nudge that would cross the cell boundary or the shell seam is clamped; the clamp is deterministic.
- [ ] vitest: with a void larger than the pouch's spread capacity, a back nudge puts the gap at the front and a front nudge puts it at the back; with a void it can fill, the settled rect is the same for every nudge.
- [ ] vitest: fingerprint and exact-match are byte-identical with and without offsets; the pack list ignores them.
- [ ] `npx tsx lib/spatial-fillings/api-contract.check.ts` asserts the two columns on every pillow **Placement** reader.
- [ ] Alt + arrows and the Fine toggle nudge the selected piece 5 mm and the value persists through save and reload on Configure, **Result** assign and a Staff-assist hold.
- [ ] `./scripts/graphify update .` run and committed.
