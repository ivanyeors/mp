// ponytail: the pouch drag is pointer events, not a second @dnd-kit provider — the layer rows
// already own one provider per cell for their sort, and a droppable inside it would register there,
// not with an outer pouch provider.

import type { Cell, PieceRef } from "@/lib/configurator/staff-assist";
import { SECTIONS, SUB_SECTIONS, type Section, type SubSection } from "@/lib/spatial-fillings/core";

export type PouchDropTarget =
  | { kind: "cell"; section: Section; subSection: SubSection }
  | { kind: "layer"; section: Section; subSection: SubSection; depth: number };

export type PouchDropDestination = { cell: Cell; layer: number | null };

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

export function dropIndex(others: ReadonlyArray<{ cx: number; cy: number; h: number }>, x: number, y: number): number {
  return others.filter((o) => o.cy + o.h / 2 < y || (Math.abs(o.cy - y) <= o.h / 2 && o.cx < x)).length;
}
