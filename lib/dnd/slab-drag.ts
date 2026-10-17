/**
 * Slab drag adapter: what a filling dropped on the cross-section asks
 * `movePiece` for. The side view's twin of `pouch-drag.ts` — pure, so the
 * drag's meaning is testable without mounting the renderer.
 *
 * The cut shows one Section along its length: front → back across, Layers
 * stacked top (depth 0) → deep (the back panel). So a drop reads both axes:
 * the column under the pointer is the sub-section, the height is the Layer.
 * Within a column each of the cell's own Layers is a band (`cellBands`); the
 * top and bottom edge of a band insert a NEW Layer above / below it, its
 * middle joins that Layer (the pieces then lie side by side across the
 * Section). An empty column takes the piece as its first Layer, and a Section
 * tab takes it to the same sub-section of that Section.
 *
 * The preview is the drop applied and the fit recomputed through the same
 * pure functions the commit uses, so what the cut shows mid-drag is exactly
 * what lands. The committed cut never recomputes: it draws the host's fit.
 */

import { cellLayers, layerOf, moveLayer, movePiece, type Cell, type MoveResult, type PieceRef } from "@/lib/configurator/staff-assist";
import { MAX_LAYERS_PER_CELL, type PillowPlacement, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import type { AlongSlab } from "@/lib/spatial-fillings/cross-section";
import { fitPillow, type FitContext, type PillowFit } from "@/lib/spatial-fillings/fit";

export type SlabDropTarget =
  /** Join an existing Layer of the cell (side by side across the Section). */
  | { kind: "layer"; section: Section; subSection: SubSection; depth: number }
  /** A new Layer inserted at `gap`: 0 = on top, the cell's Layer count = under the deepest. */
  | { kind: "gap"; section: Section; subSection: SubSection; gap: number }
  /** The cell's topmost Layer with room: an empty column, or a Section tab. */
  | { kind: "cell"; section: Section; subSection: SubSection };

/** One of a cell's own Layers as the cut draws it: mm above the back panel. */
export type LayerBand = { depth: number; lowMm: number; highMm: number };

/** Each band's top and bottom share that inserts a new Layer; the rest joins it. */
export const BAND_EDGE = 0.35;

const cellPrefix = (cell: Cell) => `${cell.section}/${cell.subSection}/`;

/** A cell's own Layers in the along cut, top → deep: the span its pieces' slabs cover. */
export function cellBands(slabs: readonly AlongSlab[], cell: Cell): LayerBand[] {
  const byDepth = new Map<number, LayerBand>();
  for (const s of slabs) {
    if (!s.key.startsWith(cellPrefix(cell))) continue;
    const top = s.bottomMm + s.heightMm;
    const band = byDepth.get(s.depth);
    if (band) {
      band.lowMm = Math.min(band.lowMm, s.bottomMm);
      band.highMm = Math.max(band.highMm, top);
    } else byDepth.set(s.depth, { depth: s.depth, lowMm: s.bottomMm, highMm: top });
  }
  return [...byDepth.values()].sort((a, b) => a.depth - b.depth);
}

/**
 * The target a pointer `mm` above the back panel names in a cell's column:
 * above a band (or in its top edge) a new Layer over it, below the deepest
 * (or in a band's bottom edge) a new Layer under it, a band's middle that
 * Layer, an empty column the cell itself.
 */
export function slabTargetAt(cell: Cell, bands: readonly LayerBand[], mm: number): SlabDropTarget {
  if (bands.length === 0) return { kind: "cell", ...cell };
  const gap = (g: number): SlabDropTarget => ({ kind: "gap", ...cell, gap: g });
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (mm > b.highMm) return gap(i);
    if (mm >= b.lowMm) {
      const t = (b.highMm - mm) / Math.max(b.highMm - b.lowMm, 1e-6); // 0 at its top edge
      if (t < BAND_EDGE) return gap(i);
      if (t > 1 - BAND_EDGE) return gap(i + 1);
      return { kind: "layer", ...cell, depth: b.depth };
    }
  }
  return gap(bands.length);
}

const sameCell = (a: Cell, b: Cell) => a.section === b.section && a.subSection === b.subSection;

/**
 * The placements after a drop, or `null` when it changes nothing (back on its
 * own Layer, or into the gap it already fills). Refuses with `movePiece`'s
 * cap errors. A new Layer goes in under the deepest and is then lifted to its
 * gap with `moveLayer`, so the caps and compaction stay `movePiece`'s.
 */
export function applySlabDrop(placements: PillowPlacement[], source: PieceRef, target: SlabDropTarget): MoveResult | null {
  const cell: Cell = { section: target.section, subSection: target.subSection };
  const moving = placements.find((p) => sameCell(p, source) && p.slot === source.slot);
  if (!moving) return { ok: false, error: `No piece at ${source.section} ${source.subSection} slot ${source.slot}` };
  const staying = sameCell(source, cell);
  const own = layerOf(moving);
  // Lifted out alone, its Layer closes and every deeper index moves up one.
  const alone = staying && cellLayers(placements, cell)[own]?.length === 1;
  if (target.kind === "cell") {
    return staying ? null : movePiece(placements, source, { cell, layer: null });
  }
  if (target.kind === "layer") {
    if (staying && target.depth === own) return null;
    return movePiece(placements, source, { cell, layer: alone && target.depth > own ? target.depth - 1 : target.depth });
  }
  if (alone && (target.gap === own || target.gap === own + 1)) return null;
  const gap = alone && target.gap > own ? target.gap - 1 : target.gap;
  const lifted = cellLayers(
    placements.filter((p) => p !== moving),
    cell,
  ).length;
  if (lifted >= MAX_LAYERS_PER_CELL) return { ok: false, error: `Max ${MAX_LAYERS_PER_CELL} layers per cell` };
  const r = movePiece(placements, source, { cell, layer: lifted });
  if (!r.ok || gap >= lifted) return r;
  return { ...r, placements: moveLayer(r.placements, cell, lifted, Math.max(gap, 0)) };
}

/**
 * The cut's ↑ / ↓: one step up or down the stack, past the neighbouring
 * Layer. Side-on, two pieces in one Layer draw over each other, so a key
 * never merges a piece into a Layer — a lone piece swaps places with its
 * neighbour, a piece that shares its Layer splits out above or below it.
 * `null` at the top or the bottom.
 */
export function stepSlabLayer(placements: PillowPlacement[], ref: PieceRef, dir: 1 | -1): MoveResult | null {
  const moving = placements.find((p) => sameCell(p, ref) && p.slot === ref.slot);
  if (!moving) return { ok: false, error: `No piece at ${ref.section} ${ref.subSection} slot ${ref.slot}` };
  const layers = cellLayers(placements, ref);
  const own = layerOf(moving);
  const alone = layers[own]?.length === 1;
  const gap = alone ? (dir === -1 ? own - 1 : own + 2) : dir === -1 ? own : own + 1;
  if (gap < 0 || gap > layers.length) return null;
  return applySlabDrop(placements, ref, { kind: "gap", section: ref.section, subSection: ref.subSection, gap });
}

/** The drop and the fit it would leave — what the cut draws while the slab is held over a target. */
export function previewSlabDrop(
  placements: PillowPlacement[],
  source: PieceRef,
  target: SlabDropTarget,
  ctx: FitContext,
): { result: MoveResult | null; fit: PillowFit | null } {
  const result = applySlabDrop(placements, source, target);
  return { result, fit: result?.ok ? fitPillow(result.placements, ctx) : null };
}

/** What a drop will do, in words — the cut's live drop hint and its screen-reader echo. */
export function describeSlabTarget(target: SlabDropTarget, layerCount: number, sourceSection?: Section): string {
  const where = `${target.section} ${target.subSection}`;
  switch (target.kind) {
    case "cell":
      if (sourceSection && target.section !== sourceSection) return `to the ${target.section} Section, ${target.subSection}`;
      return layerCount === 0 ? `into the empty ${where}` : `into ${where}`;
    case "layer":
      return `${where}, layer ${target.depth + 1} — side by side`;
    case "gap":
      if (target.gap === 0) return `${where}, new top layer`;
      if (target.gap >= layerCount) return `${where}, new bottom layer`;
      return `${where}, new layer between ${target.gap} and ${target.gap + 1}`;
  }
}

/** A stable key for a target, so the preview is recomputed only when the target changes. */
export function slabTargetKey(target: SlabDropTarget | null): string {
  if (!target) return "";
  const tail = target.kind === "layer" ? target.depth : target.kind === "gap" ? target.gap : "";
  return `${target.kind}:${target.section}/${target.subSection}:${tail}`;
}
