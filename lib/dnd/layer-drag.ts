import { sortableMove, type SortableDragEndEvent } from "./sortable-move";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";

export const layerSortableId = (layer: readonly PillowPlacement[]) => `L${layer[0]?.slot ?? 0}`;

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
