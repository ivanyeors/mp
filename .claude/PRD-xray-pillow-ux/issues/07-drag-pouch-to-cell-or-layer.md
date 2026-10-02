# 07: Drag a pouch onto another cell or Layer — pointer and touch

Tracker: #207 · Parent: #200

**Type:** AFK
**Blocked by:** 06 (every drop resolves through `movePiece`)
**User stories:** 37, 38
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:storefront`
**Status:** built (PR #213) — pointer-event drag on each pouch's hit path, the pure adapter `lib/dnd/pouch-drag.ts` (tested), drop targets on the nine cells, every layer row and the add-layer button, hover highlight and refusal through `movePiece`.

## Goal

Pick up a pouch and put it where it goes. A drag can never do anything a keystroke cannot; it is a second input for the same move.

## The gap, precisely

- The only drag in the editor is the layer rows (`LayerRow` via `useSortable`, one `DragDropProvider` per cell).
- The nine cell hit paths (`CELL_CLIP_PATHS`, clipped to the silhouette) exist as add targets in the dive; they are the natural drop targets.
- `lib/dnd/sortable-move.ts` and `layer-drag.ts` document the two dnd-kit traps this repo has already hit (destination is the projected index, ids must be identities). A pouch drag is not a sortable list, so it uses plain draggable / droppable, but the adapter stays pure and tested the same way.

## Scope

- **Draggable pouches** in the dive: each pouch group (the centroid chip on desktop, the pouch path itself on phone) becomes a `@dnd-kit/react` draggable with the piece ref as its id; `touch-none` on the handle so a long-press does not scroll.
- **Droppables:** the nine cell hit paths (any Section, not only the dived one, so a cross-Section drop works) and each visible layer row (depth target). Dropping on a cell targets its topmost layer with room (the `addPiece(null)` rule); dropping on a row targets that layer.
- **Adapter** `lib/dnd/pouch-drag.ts` (pure): dnd-kit drag-end event → `movePiece` arguments or `null`. The renderer calls `movePiece` and the same refusal / Undo paths as slice 06.
- **Feedback:** the hovered droppable cell highlights in the selection blue (the add-target white is invisible on the unveiled Section); a cell whose `wouldFit` is `over` for the dragged piece highlights red and the drop is refused with the fit message.
- **Escape** mid-drag cancels the drag, not the dive (the existing `draggingRef` guard).

## Acceptance criteria

- [x] vitest: the adapter maps a drop on a cell to `{ cell, layer: null }`, a drop on a layer row to `{ cell, layer }`, a cancel or a drop on the source to `null` (`pouch-drag.test.ts`, including the element-to-target reader).
- [x] Desktop: drag a pouch to another cell of the dived Section, to a cell of another Section, and onto a layer row (or the add-layer button for a new Layer); each resolves to one `movePiece`, so the x-ray, panel, cross-section and pack list derive from the same Placements. *As built:* the handle is the pouch's own outline on every device, not the centroid chip — one gesture, one code path. *(Browser check for Ivan: wired, not yet seen on a deployed build.)*
- [x] Phone: drag a pouch and drop it on another cell; `touch-action: none` on the handle keeps the page from scrolling. *(Browser check for Ivan.)*
- [x] A drop that would not fit is refused with the fit message and the cell shows red while hovered (`wouldFit` on the hovered destination during the drag; `movePiece` refuses on drop).
- [x] Escape during a drag cancels the drag and keeps the dive open (a capture-phase listener while the drag is active; the dive's own guard stands down through `draggingRef`).
- [x] `xray-dive.check.ts` extended for the handle, the drop targets, the adapter and the refusal wiring, and still exactly one sortable provider per cell.
- [x] `./scripts/graphify update .` run and committed (from a cold cache).

## Build notes (2026-09-25)

- **Pointer events, not a second `@dnd-kit` provider.** The layer rows own one `DragDropProvider` per cell for their sort, and a `useDroppable` inside it would register there, never with an outer pouch provider; nested providers do not compose. The pouch drag is therefore ~90 lines of pointer handling on the pouch's hit path: capture on press, a 6 px threshold so a click still selects, `document.elementFromPoint` → `dropTargetFromElement` on move, `pouchDropDestination` → `movePiece` on release. `ponytail:` swap in a dnd-kit draggable if the rows ever move to a shared provider with `group` ids.
- **Drop targets are tags, not registrations.** The nine cell regions exist only while a drag is active (transparent, silhouette-clipped, hit-testable) so a drop can cross Sections; each layer row carries `data-drop-cell` + `data-drop-layer`, and the add-layer button `data-drop-layer={layers.length}` for a new Layer.
- **Feedback** reuses the slice 04 vocabulary: the hovered cell takes the selection blue at low opacity, red with `RING_OVER` when `wouldFit` says the drop could not close; a ghost of the authored outline follows the pointer inside the silhouette clip.
- **Selection follows the drag**: the dragged piece is selected when the drag activates, `commitMove` (shared with keys and the pad) moves the selection to the new ref and offers the same Undo; the click that follows a drop is swallowed once so it cannot re-select the stale ref.

## Revision (2026-09-27): the drag replaces the move pad

Ivan's review: keep the moves, lose the pad. The eight-button move pad (slice 06) is gone from the cell panel and the phone dock; the keys stay. The drag now carries every move:

- **Any Section, no dive needed.** Every pouch's outline is a drag handle — the dived Section's authored one, every other Section's settled one. A tap on a pouch outside the dive dives into its Section and selects it. The centroid chips and layer-row labels that sit over pouches are handles too.
- **Side-by-side cells take the pouch straight in**, at the drop's position in the row (`dropIndex`); a drop in its own row is a reorder (← → on the keys), never fit-refused.
- **Stacked cells ask which Layer** in a sunburst at the drop point (phones: centred): Top layer … Layer n, then New layer; its own and full Layers are disabled. Escape or a click away leaves the pouch where it was. `planPouchDrop`, `layerChoices` and `resolveLayerChoice` in `lib/dnd/pouch-drag.ts` are pure and tested.
- **Touch.** `touch-action: none` does not reach SVG shapes in Chromium, so a finger drag panned the page and cancelled the drag; a non-passive `touchstart` on the pouch hit paths holds the page still (only there — the pillow still scrolls the page elsewhere), and the tap is handled on pointer-up.
- A drop into another Section while dived follows the pouch there, so it stays selected and in view.
