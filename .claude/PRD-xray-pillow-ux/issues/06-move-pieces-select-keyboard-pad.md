# 06: Move pieces on the canvas — select a pouch, then keyboard or move-pad moves between cells, Layers and positions, with Undo

Tracker: #206 · Parent: #200

**Type:** AFK
**Blocked by:** 02 (true-scale hit areas), 03 (refusals through `wouldFit`)
**User stories:** 31, 32, 33, 34, 35, 36, 38, 39, 40
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`

## Goal

"The firmer one to the outside" is one gesture. Any pouch can be moved to the next cell, up or down a Layer, or along its row, without remove-and-add, with Undo, on desktop and phone.

## The gap, precisely

- `lib/configurator/staff-assist.ts` mutates by `addPiece`, `removePiece`, `removeLayer`, `moveLayer` (whole layer), `setCellArrangement`, `mirrorSection`. There is no per-piece move.
- `xray-pillow.tsx` has no selection state; pouches are not focusable; the only per-piece control is the remove chip.
- Within a layer, position is slot order (`cellPieces` sorts by slot; `packRows` packs in that order), so "left / right" is a slot swap and needs no new field.

## Scope

- **Pure moves** in `staff-assist.ts` (beside `moveLayer`):
  - `movePiece(placements, ref, to: { cell, layer?, index? })` → `{ ok, placements } | { ok: false, error }`. Re-slots in the target (lowest free slot), compacts layers in source and target, keeps `insertOrder` when the **Section** is unchanged and drops it otherwise; refuses when the target layer is full or `wouldFit` says `over`.
  - `shiftPieceLayer(placements, ref, ±1)`: adjacent layer, a new one below the deepest if needed; compaction closes the one left behind.
  - `reorderInLayer(placements, ref, ±1)`: swap slots with the neighbour in that layer.
- **Selection** in `XrayPillow`: `selected: PieceRef | null`; click / tap a pouch in the dive to select (ring + label chip); cleared on dive exit and on Escape (before the dive-exit Escape, same capture-phase guard as the drag). Pouches get `tabIndex` and `role="button"` in the dive so keyboard users can reach them.
- **Keyboard** (dive, with a selection): ← → `reorderInLayer`; ↑ ↓ move to front / back **sub-section**; `[` `]` layer up / down; Shift + ← → move to the neighbouring **Section**. All through the pure functions.
- **Move pad**: six buttons with the same actions, in the cell panel (desktop) and in the cell's dock group (phone), shown only while a piece in that cell is selected. 44 px targets on phone (the layer-row scale).
- **Refusal** uses the slice 04 toast path with `fitMessage`; a legacy-cap refusal keeps its message.
- **Undo**: the Mirror toast pattern — an inverse applied only while `placementsRef.current` is still the moved result.
- **Cross-section and gauges** update through the same memo; nothing to wire.

## Acceptance criteria

- [ ] vitest: `movePiece` across cells keeps slot uniqueness per cell, leaves both cells' layers dense, keeps `insertOrder` within a Section and drops it across; refuses a full target layer and an `over` target with the same shapes `addPiece` returns.
- [ ] vitest: `shiftPieceLayer` at the deepest layer creates a new one; moving the only piece out of a layer closes it; `reorderInLayer` at the row's end is a no-op that returns the same reference.
- [ ] Every move acts on the authored cell, Layer and order; settle (slice 11) is re-derived afterwards, and selection shows the authored cell ring together with the settled ghost.
- [ ] Click a pouch in the dive → it is outlined and named; Escape clears the selection without leaving the dive; a second Escape leaves.
- [ ] Each of the six keys performs its move and the x-ray, panel, cross-section and pack list agree afterwards.
- [ ] The move pad appears for the selected piece's cell on desktop and in its dock group on phone; every pad action equals its key.
- [ ] A refused move shows the fit message; nothing changes.
- [ ] Undo on the toast reverts the move; after a later edit, Undo reports it is unavailable (Mirror behaviour).
- [ ] `xray-dive.check.ts` extended: selection wiring, key map, pad-in-dock on phone; `layer-drag.test.ts` prior art followed for the pure adapter.
- [ ] `./scripts/graphify update .` run and committed.
