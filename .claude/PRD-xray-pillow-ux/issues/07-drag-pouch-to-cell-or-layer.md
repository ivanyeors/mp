# 07: Drag a pouch onto another cell or Layer — pointer and touch

Tracker: #207 · Parent: #200

**Type:** AFK
**Blocked by:** 06 (every drop resolves through `movePiece`)
**User stories:** 37, 38
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:storefront`

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
- **Feedback:** the hovered droppable cell highlights with the existing add-target fill; a cell whose `wouldFit` is `over` for the dragged piece highlights red and the drop is refused with the fit message.
- **Escape** mid-drag cancels the drag, not the dive (the existing `draggingRef` guard).

## Acceptance criteria

- [ ] vitest: the adapter maps a drop on a cell to `{ cell, layer: null }`, a drop on a layer row to `{ cell, layer }`, a cancel or a drop on the source to `null`.
- [ ] Desktop: drag a chip to another cell of the dived Section, to a cell of another Section, and onto a layer row; each lands where dropped and the x-ray, panel, cross-section and pack list agree.
- [ ] Phone: long-press a pouch and drop it on another cell; the page does not scroll during the drag.
- [ ] A drop that would not fit is refused with the fit message and the cell shows red while hovered.
- [ ] Escape during a drag cancels the drag and keeps the dive open.
- [ ] `xray-dive.check.ts` extended for the draggable / droppable wiring and the single provider scope.
- [ ] `./scripts/graphify update .` run and committed.
