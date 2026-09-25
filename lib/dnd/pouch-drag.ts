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
