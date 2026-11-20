import { describe, expect, it } from "vitest";

import { sortableMove, type SortableDragEndEvent } from "@/lib/dnd/sortable-move";

const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
const idOf = (item: { id: string }) => item.id;

function dragEnd(
  source: { id: string; index?: number },
  target: { id: string },
  canceled = false,
): SortableDragEndEvent {
  return { canceled, operation: { canceled, source, target } };
}

describe("sortableMove", () => {
  it("uses the projected index when dnd-kit has retargeted the drop onto the source", () => {
    const next = sortableMove(items, dragEnd({ id: "a", index: 2 }, { id: "a" }), idOf);
    expect(next?.map(idOf)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backwards", () => {
    const next = sortableMove(items, dragEnd({ id: "d", index: 0 }, { id: "d" }), idOf);
    expect(next?.map(idOf)).toEqual(["d", "a", "b", "c"]);
  });

  it("falls back to the target when the projection did not move the item", () => {
    const next = sortableMove(items, dragEnd({ id: "a", index: 0 }, { id: "c" }), idOf);
    expect(next?.map(idOf)).toEqual(["b", "c", "a", "d"]);
  });

  it("returns null for a canceled drag, so Escape mid-drag persists nothing", () => {
    expect(sortableMove(items, dragEnd({ id: "a", index: 2 }, { id: "c" }, true), idOf)).toBeNull();
  });

  it("returns null when nothing moved", () => {
    expect(sortableMove(items, dragEnd({ id: "a", index: 0 }, { id: "a" }), idOf)).toBeNull();
  });

  it("returns null for an unknown source or a missing target", () => {
    expect(sortableMove(items, dragEnd({ id: "zz", index: 1 }, { id: "a" }), idOf)).toBeNull();
    expect(sortableMove(items, { operation: { source: { id: "a", index: 1 } } }, idOf)).toBeNull();
  });

  it("ignores a projected index outside the list", () => {
    expect(sortableMove(items, dragEnd({ id: "a", index: 9 }, { id: "a" }), idOf)).toBeNull();
  });

  it("leaves the input array untouched", () => {
    const before = items.map(idOf);
    sortableMove(items, dragEnd({ id: "a", index: 3 }, { id: "a" }), idOf);
    expect(items.map(idOf)).toEqual(before);
  });
});
