import { addPiece, cellLayers, layerOf, moveLayer, movePiece, nudgePiece, type Cell, type MoveResult, type PieceRef } from "@/lib/configurator/staff-assist";
import { MAX_LAYERS_PER_CELL, MAX_OFFSET_MM, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import type { AlongSlab } from "@/lib/spatial-fillings/cross-section";
import { fitPillow, type FitContext, type PillowFit } from "@/lib/spatial-fillings/fit";
import { settlePillow, type PillowSettle } from "@/lib/spatial-fillings/settle";

export type SlabDropTarget =
  | { kind: "layer"; section: Section; subSection: SubSection; depth: number }
  | { kind: "gap"; section: Section; subSection: SubSection; gap: number }
  | { kind: "cell"; section: Section; subSection: SubSection };

export type LayerBand = { depth: number; lowMm: number; highMm: number };

export const BAND_EDGE = 0.35;

const cellPrefix = (cell: Cell) => `${cell.section}/${cell.subSection}/`;

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

export function slabTargetAt(cell: Cell, bands: readonly LayerBand[], mm: number): SlabDropTarget {
  if (bands.length === 0) return { kind: "cell", ...cell };
  const gap = (g: number): SlabDropTarget => ({ kind: "gap", ...cell, gap: g });
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (mm > b.highMm) return gap(i);
    if (mm >= b.lowMm) {
      const t = (b.highMm - mm) / Math.max(b.highMm - b.lowMm, 1e-6);
      if (t < BAND_EDGE) return gap(i);
      if (t > 1 - BAND_EDGE) return gap(i + 1);
      return { kind: "layer", ...cell, depth: b.depth };
    }
  }
  return gap(bands.length);
}

const sameCell = (a: Cell, b: Cell) => a.section === b.section && a.subSection === b.subSection;

export function applySlabDrop(placements: PillowPlacement[], source: PieceRef, target: SlabDropTarget): MoveResult | null {
  const cell: Cell = { section: target.section, subSection: target.subSection };
  const moving = placements.find((p) => sameCell(p, source) && p.slot === source.slot);
  if (!moving) return { ok: false, error: `No piece at ${source.section} ${source.subSection} slot ${source.slot}` };
  const staying = sameCell(source, cell);
  const own = layerOf(moving);
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

export function addAtSlabTarget(
  placements: PillowPlacement[],
  target: SlabDropTarget,
  itemId: number,
): { ok: true; placements: PillowPlacement[] } | { ok: false; error: string } {
  const cell: Cell = { section: target.section, subSection: target.subSection };
  if (target.kind === "cell") return addPiece(placements, cell, itemId, null);
  if (target.kind === "layer") return addPiece(placements, cell, itemId, target.depth);
  const layers = cellLayers(placements, cell).length;
  if (layers >= MAX_LAYERS_PER_CELL) return addPiece(placements, cell, itemId, null);
  const added = addPiece(placements, cell, itemId, layers);
  if (!added.ok || target.gap >= layers) return added;
  return { ok: true, placements: moveLayer(added.placements, cell, layers, Math.max(target.gap, 0)) };
}

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

export type SlabPlaceResult = (Extract<MoveResult, { ok: true }> & { within: boolean; snap?: AlongSnap }) | Extract<MoveResult, { ok: false }>;

export const asMove = (r: MoveResult | null): SlabPlaceResult | null => (r && r.ok ? { ...r, within: false } : r);

const keyOfRef = (ref: PieceRef) => `${ref.section}/${ref.subSection}/${ref.slot}`;

export type AlongExtent = { startMm: number; endMm: number; reachStartMm: number; reachEndMm: number; cellLengthMm: number };

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
  if (here.reachEndMm - here.reachStartMm < len - 0.5) return null;
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
      :
        from > -MAX_OFFSET_MM && Math.abs(startAt(from - 1) - want) <= Math.abs(startAt(Math.min(from, MAX_OFFSET_MM)) - want)
        ? from - 1
        : Math.min(from, MAX_OFFSET_MM);
  const next = nudgePiece(base, at, { xMm: p.offsetXMm ?? 0, yMm: offset });
  return next === placements ? null : { ok: true, placements: next, ref: at };
}

export type AlongSnap = "home" | "centred" | "front edge" | "back edge";

export function snapAlongCentre(
  centreMm: number,
  lenMm: number,
  cellLengthMm: number,
  homeCentreMm: number | null,
  radiusMm: number,
): { centreMm: number; snap: AlongSnap | null } {
  if (radiusMm <= 0) return { centreMm, snap: null };
  const candidates: Array<[number, AlongSnap]> = homeCentreMm === null ? [] : [[homeCentreMm, "home"]];
  for (let c = 0; c < SUB_SECTIONS.length; c++) {
    candidates.push([(c + 0.5) * cellLengthMm, "centred"]);
    if (lenMm < cellLengthMm - 1) {
      candidates.push([c * cellLengthMm + lenMm / 2, "front edge"]);
      candidates.push([(c + 1) * cellLengthMm - lenMm / 2, "back edge"]);
    }
  }
  let best: [number, AlongSnap] | null = null;
  for (const cand of candidates) {
    const d = Math.abs(cand[0] - centreMm);
    if (d <= radiusMm && (!best || d < Math.abs(best[0] - centreMm) - 1e-9)) best = cand;
  }
  return best ? { centreMm: best[0], snap: best[1] } : { centreMm, snap: null };
}

export function homeCentreMm(placements: PillowPlacement[], ref: PieceRef, ctx: FitContext): number | null {
  const p = placements.find((q) => sameCell(q, ref) && q.slot === ref.slot);
  if (!p) return null;
  const home = p.offsetYMm ? nudgePiece(placements, ref, { xMm: p.offsetXMm ?? 0, yMm: 0 }) : placements;
  const e = alongExtent(settlePillow(home, { size: ctx.size, dims: ctx.dims, pillow: ctx.pillow }), ref);
  return e ? (e.startMm + e.endMm) / 2 : null;
}

export function placeSlabDrop(
  placements: PillowPlacement[],
  source: PieceRef,
  target: SlabDropTarget,
  centreMm: number,
  ctx: FitContext,
  snapMm = 0,
): SlabPlaceResult | null {
  const moved = applySlabDrop(placements, source, target);
  if (moved && !moved.ok) return moved;
  const base = moved ? moved.placements : placements;
  const ref = moved ? moved.ref : source;
  const here = alongExtent(settlePillow(base, { size: ctx.size, dims: ctx.dims, pillow: ctx.pillow }), ref);
  if (!here) return null;
  const len = here.endMm - here.startMm;
  const { centreMm: at, snap } = snapAlongCentre(centreMm, len, here.cellLengthMm, snapMm > 0 ? homeCentreMm(base, ref, ctx) : null, snapMm);
  const placed = placeAlongAt(base, ref, at - len / 2, ctx, Boolean(moved));
  const next = placed ?? { ok: true as const, placements: base, ref };
  if (next.placements === placements) return null;
  return { ...next, within: !moved && next.ref.section === source.section && next.ref.subSection === source.subSection, ...(snap ? { snap } : {}) };
}

export function nudgeSlab(placements: PillowPlacement[], ref: PieceRef, stepMm: number, ctx: FitContext): SlabPlaceResult | null {
  const here = alongExtent(settlePillow(placements, { size: ctx.size, dims: ctx.dims, pillow: ctx.pillow }), ref);
  if (!here) return null;
  const r = placeAlongAt(placements, ref, here.startMm + stepMm, ctx);
  return r ? { ...r, within: r.ref.subSection === ref.subSection } : null;
}

export function previewSlabDrop(
  placements: PillowPlacement[],
  source: PieceRef,
  target: SlabDropTarget,
  ctx: FitContext,
  centreMm?: number,
  snapMm = 0,
): { result: SlabPlaceResult | null; fit: PillowFit | null } {
  const result = centreMm === undefined ? asMove(applySlabDrop(placements, source, target)) : placeSlabDrop(placements, source, target, centreMm, ctx, snapMm);
  return { result, fit: result?.ok ? fitPillow(result.placements, ctx) : null };
}

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

export function slabTargetKey(target: SlabDropTarget | null): string {
  if (!target) return "";
  const tail = target.kind === "layer" ? target.depth : target.kind === "gap" ? target.gap : "";
  return `${target.kind}:${target.section}/${target.subSection}:${tail}`;
}
