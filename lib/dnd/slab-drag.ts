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

import { cellLayers, layerOf, moveLayer, movePiece, nudgePiece, type Cell, type MoveResult, type PieceRef } from "@/lib/configurator/staff-assist";
import { MAX_LAYERS_PER_CELL, MAX_OFFSET_MM, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import type { AlongSlab } from "@/lib/spatial-fillings/cross-section";
import { fitPillow, type FitContext, type PillowFit } from "@/lib/spatial-fillings/fit";
import { settlePillow, type PillowSettle } from "@/lib/spatial-fillings/settle";

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

/** A move the cut writes; `within` when the pouch only moved in its own cell (a nudge). */
export type SlabPlaceResult = (Extract<MoveResult, { ok: true }> & { within: boolean }) | Extract<MoveResult, { ok: false }>;

/** A plain move, as a place result: it left its cell (or changed nothing). */
export const asMove = (r: MoveResult | null): SlabPlaceResult | null => (r && r.ok ? { ...r, within: false } : r);

const keyOfRef = (ref: PieceRef) => `${ref.section}/${ref.subSection}/${ref.slot}`;

/** A placed pouch's settled extent along its Section, mm, and the room it may slide in. */
export type AlongExtent = { startMm: number; endMm: number; reachStartMm: number; reachEndMm: number; cellLengthMm: number };

/** Where a pouch stands along its Section once settled, and the room it may slide in; `null` when it is not placed. */
export function alongExtent(settle: PillowSettle, ref: PieceRef): AlongExtent | null {
  const s = settle.pieces.find((p) => p.key === keyOfRef(ref));
  if (!s) return null;
  const cell = settle.cellLengthMm;
  return {
    startMm: s.startMm,
    endMm: s.endMm,
    reachStartMm: SUB_SECTIONS.indexOf(s.reachFrom) * cell,
    reachEndMm: (SUB_SECTIONS.indexOf(s.reachTo) + 1) * cell,
    cellLengthMm: cell,
  };
}

/**
 * Stand a pouch's settled extent at `startMm` from its Section's front: the
 * one writer of the front ↔ back position, for both views — the top view's
 * drag and Alt + arrows, the cut's drop and Alt + ← / →. It slides anywhere
 * its plane leaves free (its own column and the empty ones beside it at its
 * Layer), never into a neighbour of its own Layer, and stops at the
 * Section's ends, so what either view draws is what the other draws.
 *
 * The stored offset (Size M mm, whole) is solved against the settle itself:
 * a nudge changes which way the pouch spreads (`anchorAlong`), so the spread
 * never leaves it off from where it was put. Its across offset is kept.
 *
 * Unless `keepCell`, a pouch whose centre ends in another column — a free
 * one — moves to that cell, under anything lying there: a pouch slid along
 * its chamber is then in that sub-section. `null` when nothing changes.
 */
export function placeAlongAt(
  placements: PillowPlacement[],
  ref: PieceRef,
  startMm: number,
  ctx: FitContext,
  keepCell = false,
): Extract<MoveResult, { ok: true }> | null {
  const settleCtx = { size: ctx.size, dims: ctx.dims, pillow: ctx.pillow };
  const here = alongExtent(settlePillow(placements, settleCtx), ref);
  if (!here) return null;
  const len = here.endMm - here.startMm;
  const want = Math.min(Math.max(startMm, here.reachStartMm), Math.max(here.reachStartMm, here.reachEndMm - len));
  let base = placements;
  let at = ref;
  const col = Math.min(Math.floor((want + len / 2) / here.cellLengthMm), SUB_SECTIONS.length - 1);
  if (!keepCell && col !== SUB_SECTIONS.indexOf(ref.subSection)) {
    const cell: Cell = { section: ref.section, subSection: SUB_SECTIONS[col] };
    const moved = movePiece(placements, ref, { cell, layer: cellLayers(placements, cell).length });
    if (moved.ok) {
      base = moved.placements;
      at = moved.ref;
    }
  }
  const p = base.find((q) => sameCell(q, at) && q.slot === at.slot)!;
  const startAt = (offsetYMm: number) => {
    const trial = nudgePiece(base, at, { xMm: p.offsetXMm ?? 0, yMm: offsetYMm });
    return alongExtent(settlePillow(trial, settleCtx), at)!.startMm;
  };
  // The drawn start only grows with the offset, and against a wall many offsets draw it alike: find the run of
  // whole offsets that stand it within half a millimetre of `want`, and keep the one nearest to what it has.
  const firstWith = (ok: (start: number) => boolean) => {
    let lo = -MAX_OFFSET_MM;
    let hi = MAX_OFFSET_MM + 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (ok(startAt(mid))) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  const from = firstWith((start) => start >= want - 0.5);
  const to = firstWith((start) => start > want + 0.5) - 1;
  const current = p.offsetYMm ?? 0;
  const offset =
    from <= to
      ? Math.min(Math.max(current, from), to)
      : // No whole offset lands that close (a step in the spread): the nearer of the two either side.
        from > -MAX_OFFSET_MM && Math.abs(startAt(from - 1) - want) <= Math.abs(startAt(Math.min(from, MAX_OFFSET_MM)) - want)
        ? from - 1
        : Math.min(from, MAX_OFFSET_MM);
  const next = nudgePiece(base, at, { xMm: p.offsetXMm ?? 0, yMm: offset });
  return next === placements ? null : { ok: true, placements: next, ref: at };
}

/**
 * A drop on the cut, placed: the move `applySlabDrop` makes (none when it
 * stays in its own Layer), then its front ↔ back position so the pouch is
 * centred where the pointer let go (`centreMm` from the Section's front) —
 * as far as there is room (`placeAlongAt`). `null` when nothing changes.
 */
export function placeSlabDrop(
  placements: PillowPlacement[],
  source: PieceRef,
  target: SlabDropTarget,
  centreMm: number,
  ctx: FitContext,
): SlabPlaceResult | null {
  const moved = applySlabDrop(placements, source, target);
  if (moved && !moved.ok) return moved;
  const base = moved ? moved.placements : placements;
  const ref = moved ? moved.ref : source;
  const here = alongExtent(settlePillow(base, { size: ctx.size, dims: ctx.dims, pillow: ctx.pillow }), ref);
  const placed = here ? placeAlongAt(base, ref, centreMm - (here.endMm - here.startMm) / 2, ctx, Boolean(moved)) : null;
  const next = placed ?? { ok: true as const, placements: base, ref };
  if (next.placements === placements) return null;
  return { ...next, within: !moved && next.ref.section === source.section && next.ref.subSection === source.subSection };
}

/**
 * Alt + ← / → on the cut (and the top view's Alt + ↑ / ↓): the pouch slides
 * `stepMm` (this Size's mm; − to the front) as far as there is room. `null`
 * when it has none that way.
 */
export function nudgeSlab(placements: PillowPlacement[], ref: PieceRef, stepMm: number, ctx: FitContext): SlabPlaceResult | null {
  const here = alongExtent(settlePillow(placements, { size: ctx.size, dims: ctx.dims, pillow: ctx.pillow }), ref);
  if (!here) return null;
  const r = placeAlongAt(placements, ref, here.startMm + stepMm, ctx);
  return r ? { ...r, within: r.ref.subSection === ref.subSection } : null;
}

/**
 * The drop and the fit it would leave — what both views draw while a slab is
 * held over a target. With `centreMm` it is the placed drop (`placeSlabDrop`),
 * so the landing follows the pointer front ↔ back to the millimetre; without,
 * the move alone (a Section tab, where it lands at home).
 */
export function previewSlabDrop(
  placements: PillowPlacement[],
  source: PieceRef,
  target: SlabDropTarget,
  ctx: FitContext,
  centreMm?: number,
): { result: SlabPlaceResult | null; fit: PillowFit | null } {
  const result = centreMm === undefined ? asMove(applySlabDrop(placements, source, target)) : placeSlabDrop(placements, source, target, centreMm, ctx);
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
