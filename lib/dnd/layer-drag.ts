/**
 * Layer reorder adapter: a `@dnd-kit/react` drag-end event → the (from, to)
 * depths `moveLayer` takes. Pure, so the x-ray's drag behaviour is testable
 * without mounting the renderer.
 *
 * Two things here are not obvious, and getting either wrong leaves the panel and
 * the pouches showing different orders:
 *
 * 1. The destination is the PROJECTED source index, never `operation.target` —
 *    see `sortableMove`, which this delegates to. dnd-kit retargets a moved drop
 *    onto the source itself, so a handler that reads `target` and bails on
 *    `source.id === target.id` does nothing on exactly the drags that moved a row.
 *
 * 2. The sortable id has to be the layer's IDENTITY, not its depth. dnd-kit
 *    animates a dropped row from where it projected it to where React re-renders
 *    it; a positional `L{depth}` id sits at the same index before and after the
 *    write, so every successful drag flips visibly back to the slot it came from.
 *    A layer's lowest slot is stable across reorders (`moveLayer` rewrites `row`
 *    only, never `slot`), so it travels with the layer.
 */

import { sortableMove, type SortableDragEndEvent } from "./sortable-move";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";

/** A layer's stable sortable id: its lowest slot, which a reorder never changes. */
export const layerSortableId = (layer: readonly PillowPlacement[]) => `L${layer[0]?.slot ?? 0}`;

/**
 * The depths to hand `moveLayer`, or `null` when the drag changed nothing (a
 * cancel, a drop back on itself, a source this list does not hold).
 *
 * `layers` must be ONE cell's layers top→deep, matching the one
 * `DragDropProvider` that emitted the event: `source.index` is an index within
 * the provider's group, so a provider spanning several cells would project into
 * the wrong list.
 */
export function layerDragDestination(
  layers: ReadonlyArray<readonly PillowPlacement[]>,
  event: SortableDragEndEvent,
): { from: number; to: number } | null {
  const next = sortableMove(layers, event, layerSortableId);
  if (!next) return null;
  const dragged = String(event.operation?.source?.id);
  const from = layers.findIndex((l) => layerSortableId(l) === dragged);
  const to = next.findIndex((l) => layerSortableId(l) === dragged);
  return from === -1 || to === -1 || from === to ? null : { from, to };
}
