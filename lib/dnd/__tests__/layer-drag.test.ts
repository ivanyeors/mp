import { describe, expect, it } from "vitest";

import { layerDragDestination, layerSortableId } from "@/lib/dnd/layer-drag";
import { cellLayers, moveLayer, type Cell } from "@/lib/configurator/staff-assist";
import type { PillowPlacement } from "@/lib/spatial-fillings/core";
import type { SortableDragEndEvent } from "@/lib/dnd/sortable-move";

const cell: Cell = { section: "right", subSection: "back" };

/** Three stacked layers in one cell, top→deep: slots 1, 2, 3. */
const placements: PillowPlacement[] = [
  { section: "right", subSection: "back", slot: 1, itemId: 11, row: 0 },
  { section: "right", subSection: "back", slot: 2, itemId: 22, row: 1 },
  { section: "right", subSection: "back", slot: 3, itemId: 33, row: 2 },
  // A second cell, to prove a reorder here never touches it.
  { section: "left", subSection: "front", slot: 1, itemId: 44 },
];

/** A drag-end event as `@dnd-kit/dom/sortable` emits it. */
const dragEnd = (
  source: { id: string; index?: number },
  target: { id: string },
  canceled = false,
): SortableDragEndEvent => ({ canceled, operation: { canceled, source, target } });

describe("layerSortableId", () => {
  it("is the layer's lowest slot, so it survives a reorder", () => {
    const before = cellLayers(placements, cell).map(layerSortableId);
    expect(before).toEqual(["L1", "L2", "L3"]);
    // The regression: a positional `L{depth}` id yields the SAME list after the
    // write, so dnd-kit sees no change and animates the dropped row back.
    const after = cellLayers(moveLayer(placements, cell, 0, 2), cell).map(layerSortableId);
    expect(after).toEqual(["L2", "L3", "L1"]);
  });
});

describe("layerDragDestination", () => {
  it("reads the projected index when dnd-kit retargeted the drop onto the source", () => {
    // The bug: every real reorder arrives with target === source, and the old
    // handler bailed on exactly that — the rows had slid, nothing was written.
    const layers = cellLayers(placements, cell);
    expect(layerDragDestination(layers, dragEnd({ id: "L1", index: 2 }, { id: "L1" }))).toEqual({
      from: 0,
      to: 2,
    });
  });

  it("drives moveLayer to the order the rows were dropped in", () => {
    const layers = cellLayers(placements, cell);
    const move = layerDragDestination(layers, dragEnd({ id: "L3", index: 0 }, { id: "L3" }))!;
    const next = moveLayer(placements, cell, move.from, move.to);
    expect(cellLayers(next, cell).map((l) => l[0].itemId)).toEqual([33, 11, 22]);
    // Other cells are untouched — a layer reorder is scoped to its own cell.
    expect(next.find((p) => p.section === "left")).toEqual(placements[3]);
  });

  it("falls back to the target when the projection never moved the row", () => {
    const layers = cellLayers(placements, cell);
    expect(layerDragDestination(layers, dragEnd({ id: "L1", index: 0 }, { id: "L3" }))).toEqual({
      from: 0,
      to: 2,
    });
  });

  it("writes nothing for a canceled drag or a drop back on itself", () => {
    const layers = cellLayers(placements, cell);
    expect(layerDragDestination(layers, dragEnd({ id: "L1", index: 2 }, { id: "L3" }, true))).toBeNull();
    expect(layerDragDestination(layers, dragEnd({ id: "L1", index: 0 }, { id: "L1" }))).toBeNull();
  });

  it("writes nothing for a row this cell does not hold", () => {
    // A provider per cell makes this unreachable; it stays null-safe anyway.
    const layers = cellLayers(placements, cell);
    expect(layerDragDestination(layers, dragEnd({ id: "L9", index: 1 }, { id: "L1" }))).toBeNull();
  });
});
