/**
 * Pouch drag adapter (X-ray pillow UX slice 07): what a pouch dropped on the
 * x-ray asks `movePiece` for. Pure, like `layerDragDestination`, so the drag's
 * meaning is testable without mounting the renderer.
 *
 * The drop targets are elements the renderer tags: the nine cell regions
 * (`data-drop-cell="section/subSection"`) and each visible layer row
 * (`data-drop-cell` + `data-drop-layer="depth"`). A drop on a cell targets its
 * topmost Layer with room (the add rule, `layer: null`); a drop on a row
 * targets that Layer exactly. A cancel, a drop nowhere, or a drop back on the
 * pouch's own cell and Layer is `null` — nothing to write.
 *
 * ponytail: the pouch drag is pointer events, not a second @dnd-kit provider —
 * the layer rows already own one provider per cell for their sort, and a
 * droppable inside it would register there, not with an outer pouch provider.
 */

import type { Cell, PieceRef } from "@/lib/configurator/staff-assist";
import { SECTIONS, SUB_SECTIONS, type Section, type SubSection } from "@/lib/spatial-fillings/core";

export type PouchDropTarget =
  | { kind: "cell"; section: Section; subSection: SubSection }
  | { kind: "layer"; section: Section; subSection: SubSection; depth: number };

export type PouchDropDestination = { cell: Cell; layer: number | null };

/** The target under the pointer, from the tagged element (or an ancestor) it is over. */
export function dropTargetFromElement(el: Element | null): PouchDropTarget | null {
  const tagged = el?.closest?.("[data-drop-cell]") ?? null;
  if (!tagged) return null;
  const key = tagged.getAttribute("data-drop-cell") ?? "";
  const [section, subSection] = key.split("/");
  if (!(SECTIONS as readonly string[]).includes(section) || !(SUB_SECTIONS as readonly string[]).includes(subSection)) return null;
  const cell = { section: section as Section, subSection: subSection as SubSection };
  const layer = tagged.getAttribute("data-drop-layer");
  if (layer === null) return { kind: "cell", ...cell };
  const depth = Number(layer);
  return Number.isInteger(depth) && depth >= 0 ? { kind: "layer", depth, ...cell } : { kind: "cell", ...cell };
}

/**
 * The `movePiece` target for a drop, or `null` when the drag changed nothing:
 * cancelled, dropped nowhere, or dropped back on the pouch's own cell (a cell
 * drop) or its own Layer (a row drop).
 */
export function pouchDropDestination(
  source: PieceRef & { depth: number },
  target: PouchDropTarget | null,
  canceled = false,
): PouchDropDestination | null {
  if (canceled || !target) return null;
  const same = target.section === source.section && target.subSection === source.subSection;
  if (target.kind === "cell") {
    return same ? null : { cell: { section: target.section, subSection: target.subSection }, layer: null };
  }
  if (same && target.depth === source.depth) return null;
  return { cell: { section: target.section, subSection: target.subSection }, layer: target.depth };
}

/**
 * What a drop asks for once the target cell's Layers are known — the drag is
 * the whole move vocabulary (the move pad went with Ivan's 27-9-2026 review):
 *
 * - a layer row → that Layer (`pouchDropDestination`);
 * - another cell → straight in, on its top Layer with room, at the drop's
 *   position in that row (`index`) when one is given. Seen from above, a
 *   pouch put on a pile lies on top of it, beside what is there; its depth is
 *   the cut's to change, by dragging it up or down (the Layer picker that
 *   asked on every stacked drop went 8-11-2026: no step between drag and drop);
 * - its own cell → `nudge`: the pouch goes where it was dropped, within the
 *   free space its cell leaves it (slice 08, 28-9-2026) — or, in a
 *   side-by-side row, a reorder when the drop passes a neighbour.
 *
 * `layerCount` counts the target cell's Layers as drawn (the pouch included
 * when it is its own cell); `sourceIndex` is the pouch's position in its Layer.
 */
export type PouchDropPlan = { kind: "move"; to: PouchDropDestination & { index?: number } } | { kind: "nudge" };

export function planPouchDrop(
  source: PieceRef & { depth: number },
  target: PouchDropTarget | null,
  ctx: { layerCount: number; index?: number; sourceIndex?: number },
  canceled = false,
): PouchDropPlan | null {
  if (canceled || !target) return null;
  if (target.kind === "layer") {
    const to = pouchDropDestination(source, target);
    return to ? { kind: "move", to } : null;
  }
  const cell: Cell = { section: target.section, subSection: target.subSection };
  const same = target.section === source.section && target.subSection === source.subSection;
  if (same) {
    if (ctx.layerCount <= 1 && ctx.index !== undefined && ctx.index !== ctx.sourceIndex) {
      return { kind: "move", to: { cell, layer: source.depth, index: ctx.index } };
    }
    return { kind: "nudge" };
  }
  return { kind: "move", to: ctx.index === undefined ? { cell, layer: null } : { cell, layer: null, index: ctx.index } };
}

/**
 * Where in a side-by-side row a drop lands: the number of the row's other
 * pouches whose centre sits before the pointer (reading order — a row that
 * packs onto a second line counts the line above first).
 */
export function dropIndex(others: ReadonlyArray<{ cx: number; cy: number; h: number }>, x: number, y: number): number {
  return others.filter((o) => o.cy + o.h / 2 < y || (Math.abs(o.cy - y) <= o.h / 2 && o.cx < x)).length;
}
