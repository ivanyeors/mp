# 06: Move pieces on the canvas — select a pouch, then keyboard or move-pad moves between cells, Layers and positions, with Undo

Tracker: #206 · Parent: #200

**Type:** AFK
**Blocked by:** 02 (true-scale hit areas), 03 (refusals through `wouldFit`)
**User stories:** 31, 32, 33, 34, 35, 36, 38, 39, 40
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** built (PR #213) — `movePiece` / `shiftPieceLayer` / `reorderInLayer` in `staff-assist.ts` (tested), the key table in `lib/configurator/move-keys.ts`, selection, keys, the move pad and Undo in `xray-pillow.tsx`.

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
- **Selection** in `XrayPillow`: `selected: PieceRef | null`; click / tap a pouch in the dive to select (ring + label chip) — its layer-row label and its centroid chip select too, since they sit over the outline; cleared on dive exit and on Escape (before the dive-exit Escape, same capture-phase guard as the drag). Pouches get `tabIndex` and `role="button"` in the dive so keyboard users can reach them.
- **Keyboard** (dive, with a selection): ← → `reorderInLayer`; ↑ ↓ move to front / back **sub-section**; `[` `]` layer up / down; Shift + ← → move to the neighbouring **Section**. All through the pure functions.
- **Move pad**: six buttons with the same actions, in the cell panel (desktop) and in the cell's dock group (phone), shown only while a piece in that cell is selected. 44 px targets on phone (the layer-row scale).
- **Refusal** uses the slice 04 toast path with `fitMessage`; a legacy-cap refusal keeps its message.
- **Undo**: the Mirror toast pattern — an inverse applied only while `placementsRef.current` is still the moved result.
- **Cross-section and gauges** update through the same memo; nothing to wire.

## Acceptance criteria

- [x] vitest: `movePiece` across cells keeps slot uniqueness per cell, leaves both cells' layers dense, keeps `insertOrder` within a Section and drops it across; refuses a full target layer and an `over` target with the same shapes `addPiece` returns (`move-piece.test.ts`).
- [x] vitest: `shiftPieceLayer` at the deepest layer creates a new one; moving the only piece out of a layer closes it; `reorderInLayer` at the row's end is a no-op that returns the same reference. *Refinement:* a piece alone in the deepest Layer going down is a no-op too — it would only recreate the same Layer one step deeper.
- [x] Every move acts on the authored cell, Layer and order; settle (slice 11) is re-derived afterwards (the fit memo), and selection outlines the piece over the settled ghost (the dotted cell ring went with the 26-9-2026 review; the pad names the cell).
- [x] Click a pouch in the dive → it is outlined and named (the pad's header); Escape clears the selection without leaving the dive; a second Escape leaves (self-check on the capture-phase guard).
- [x] Each of the six keys (and the two Shift chords) performs its move through the pure functions; the x-ray, panel, cross-section and pack list all derive from the one Placements array afterwards. *(Browser check for Ivan: wired, not yet seen on a deployed build.)*
- [x] The move pad appears for the selected piece's cell on desktop and in its dock group on phone; every pad action equals its key (one `MOVE_ACTIONS` table drives both; vitest pins key ↔ action).
- [x] A refused move shows the fit message on the add's toast path; nothing changes.
- [x] Undo on the toast reverts the move and restores the selection; after a later edit, Undo reports it is unavailable (Mirror behaviour).
- [x] `xray-dive.check.ts` extended: selection wiring, key map, pad-in-dock on phone; `move-keys.ts` is the pure adapter, tested like `layer-drag.test.ts`.
- [x] `./scripts/graphify update .` run and committed (from a cold cache).

## Build notes (2026-09-25)

- **Selection target.** In the dive each pouch's authored outline is rendered again, last in the SVG, as a transparent focusable `role="button"` with `aria-pressed`; it sits above the cell add areas, so a click on a pouch selects and a click beside it still adds. The HTML overlay covers much of a stacked cell (layer rows, the centroid chip), so each row label and chip label is a `button` with the same `aria-pressed` that selects its piece. Selection is a `PieceRef`; a remove leaves it behind and the derived `selectedPiece` goes null.
- **Refs across a move.** `movePiece` returns the piece's new ref (its own slot when the cell is unchanged, else the lowest free one; the i-th lowest slot when a position is asked for), `reorderedRef` gives the neighbour's slot, so the selection follows the piece and Undo restores the old ref.
- **Keys.** A window `keydown` listener while a piece is selected; text controls (`isTypingTarget`) and a drag in flight keep their keys; arrows `preventDefault` so the page does not scroll. ↑ ↓ and Shift ← → target the neighbouring cell's topmost Layer with room (the add rule), never a specific depth, so they only refuse at a cap or on `over`.
- **Slice 07** resolves drops through the same `movePiece` with `{ cell, layer }`.
