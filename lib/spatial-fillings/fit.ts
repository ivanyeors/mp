// ponytail: pro-rata compression is the simplest deterministic rule; foam is non-linear, and slice
// 10 calibrates against real builds before anything cleverer is considered.

import {
  cellLayerGroups,
  MAX_PIECES_PER_LAYER,
  SECTIONS,
  SUB_SECTIONS,
  type BolsterPlacement,
  type PillowPlacement,
  type Section,
  type SubSection,
} from "./core";
import {
  BOLSTER_DIMENSIONS,
  dimsAtSize,
  GENERIC_POUCH,
  LOFT_ALLOWANCE,
  maxLoftMm,
  pillowDimensions,
  SEAM_MM,
  type BolsterDimensions,
  type PillowDimensions,
  type PillowSize,
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";
import { settleBolster, settlePillow, spans, subSectionIndex, type BolsterPieceSettle, type PieceSettle, type PillowSettle } from "./settle";
import type { BolsterLength } from "./xray-layout";

export { SEAM_MM };

export type FitStatus = "ok" | "compressed" | "over";

const RANK: Record<FitStatus, number> = { ok: 0, compressed: 1, over: 2 };

export function worstStatus(a: FitStatus, b: FitStatus): FitStatus {
  return RANK[b] > RANK[a] ? b : a;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export type PieceFit = {
  slot: number;
  itemId: number;
  acrossMm: number;
  minAcrossMm: number;
  widthRatio: number;
};

export type LayerFit = {
  depth: number;
  pieces: PieceFit[];
  relaxedMm: number;
  minMm: number;
  availableMm: number;
  status: FitStatus;
};

export type CellFit = {
  section: Section;
  subSection: SubSection;
  layers: LayerFit[];
  relaxedLoftMm: number;
  minLoftMm: number;
  maxLoftMm: number;
  loftMm: number;
  thicknessRatios: number[];
  loftLayers: number;
  settledInto: SubSection[];
  pressedMm: number;
  pressedBy: SubSection[];
  status: FitStatus;
};

export type ColumnPlane = {
  depth: number;
  thicknessMm: number;
  settledMm: number;
  minMm: number;
  ratio: number;
  itemId: number;
  status: FitStatus;
};

export type ColumnFit = {
  relaxedMm: number;
  minMm: number;
  maxLoftMm: number;
  loftMm: number;
  status: FitStatus;
  planes: ColumnPlane[];
};

export type SectionPieceFit = {
  key: string;
  itemId: number;
  depth: number;
  spanFrom: SubSection;
  spanTo: SubSection;
  startMm: number;
  endMm: number;
  thicknessMm: number;
  status: FitStatus;
  nudged?: true;
};

export type SectionFit = {
  section: Section;
  widthMm: number;
  maxLoftMm: number;
  loftBySubSection: Record<SubSection, number>;
  columns: Record<SubSection, ColumnFit | null>;
  pieces: SectionPieceFit[];
  status: FitStatus;
};

export type PillowFit = {
  size: PillowSize;
  loftAllowance: number;
  cells: CellFit[];
  sections: Record<Section, SectionFit>;
  settle: PillowSettle;
  status: FitStatus;
};

export type BolsterPieceFit = PieceFit &
  BolsterPieceSettle & {
    thicknessStatus: FitStatus;
  };

export type BolsterFit = {
  length: BolsterLength;
  lengthMm: number;
  diameterMm: number;
  relaxedMm: number;
  minMm: number;
  availableMm: number;
  usedMm: number;
  pieces: BolsterPieceFit[];
  lengthStatus: FitStatus;
  status: FitStatus;
};

export type BolsterFitContext = {
  dims?: ReadonlyMap<number, ResolvedDims>;
  bolster?: BolsterDimensions;
};

export function fitBolster(placements: BolsterPlacement[], length: BolsterLength, ctx: BolsterFitContext = {}): BolsterFit {
  const bolster = ctx.bolster ?? BOLSTER_DIMENSIONS[length];
  const dimsOf = (itemId: number): PouchDimensions => ctx.dims?.get(itemId)?.dims ?? GENERIC_POUCH;
  const pieces = [...placements].sort((a, b) => a.slot - b.slot).map((p) => ({ slot: p.slot, itemId: p.itemId, dims: dimsOf(p.itemId) }));
  const settled = settleBolster(pieces, bolster.lengthMm);
  const seams = SEAM_MM * Math.max(pieces.length - 1, 0);
  const widths = settled.map((s) => s.settledWidthMm);
  const floors = pieces.map((p) => Math.min(p.dims.minWidthMm, p.dims.widthMm));
  const relaxed = widths.reduce((a, b) => a + b, 0) + seams;
  const min = floors.reduce((a, b) => a + b, 0) + seams;
  let lengthStatus: FitStatus = "ok";
  let squeezed = widths.slice();
  if (relaxed > bolster.lengthMm + 1e-9) {
    lengthStatus = min <= bolster.lengthMm + 1e-9 ? "compressed" : "over";
    squeezed = shareSqueeze(widths, floors, relaxed - bolster.lengthMm);
  }
  const fitted: BolsterPieceFit[] = settled.map((s, i) => {
    const thin = s.minThicknessMm;
    const thicknessStatus: FitStatus =
      s.settledThicknessMm <= bolster.diameterMm + 1e-9 ? "ok" : thin <= bolster.diameterMm + 1e-9 ? "compressed" : "over";
    return {
      ...s,
      acrossMm: s.settledWidthMm,
      minAcrossMm: r1(floors[i]),
      widthRatio: widths[i] > 0 ? squeezed[i] / widths[i] : 1,
      thicknessStatus,
    };
  });
  const status = fitted.reduce((acc, p) => worstStatus(acc, p.thicknessStatus), lengthStatus);
  return {
    length,
    lengthMm: bolster.lengthMm,
    diameterMm: bolster.diameterMm,
    relaxedMm: r1(relaxed),
    minMm: r1(min),
    availableMm: bolster.lengthMm,
    usedMm: r1(squeezed.reduce((a, b) => a + b, 0) + seams),
    pieces: fitted,
    lengthStatus,
    status,
  };
}

export function bolsterFitMessage(fit: BolsterFit, label: (itemId: number) => string = (id) => `item #${id}`): string {
  if (fit.lengthStatus !== "ok") {
    const n = fit.pieces.length;
    return `${n} ${n === 1 ? "pouch needs" : "pouches need"} ${Math.round(fit.relaxedMm)} mm relaxed, ${Math.round(fit.minMm)} mm fully squeezed; the ${fit.length} Mbolster is ${Math.round(fit.lengthMm)} mm long`;
  }
  const thick = fit.pieces.find((p) => p.thicknessStatus !== "ok");
  if (thick) {
    return `${label(thick.itemId)} is ${Math.round(thick.settledThicknessMm)} mm thick, ${Math.round(thick.minThicknessMm)} mm fully compressed; the Mbolster is ${Math.round(fit.diameterMm)} mm across`;
  }
  return "fits";
}

export type FitContext = {
  size: string | null | undefined;
  dims?: ReadonlyMap<number, ResolvedDims>;
  loftAllowance?: number;
  pillow?: PillowDimensions;
};

function acrossOf(d: PouchDimensions): { across: number; min: number } {
  return { across: d.widthMm, min: Math.min(d.minWidthMm, d.widthMm) };
}

function shareSqueeze(relaxed: number[], floors: number[], squeeze: number): number[] {
  const ranges = relaxed.map((r, i) => Math.max(r - floors[i], 0));
  const total = ranges.reduce((a, b) => a + b, 0);
  if (squeeze <= 0) return relaxed.slice();
  if (total <= 0 || squeeze >= total) return floors.slice();
  return relaxed.map((r, i) => r - (squeeze * ranges[i]) / total);
}

export function fitLayer(
  pieces: readonly { slot: number; itemId: number; dims: PouchDimensions }[],
  availableMm: number,
  depth = 0,
): LayerFit {
  const extents = pieces.map((p) => acrossOf(p.dims));
  const seams = SEAM_MM * Math.max(pieces.length - 1, 0);
  const relaxed = extents.reduce((s, e) => s + e.across, 0) + seams;
  const min = extents.reduce((s, e) => s + e.min, 0) + seams;
  let status: FitStatus = "ok";
  let squeezed = extents.map((e) => e.across);
  if (relaxed > availableMm + 1e-9) {
    status = min <= availableMm + 1e-9 ? "compressed" : "over";
    squeezed = shareSqueeze(
      extents.map((e) => e.across),
      extents.map((e) => e.min),
      relaxed - availableMm,
    );
  }
  return {
    depth,
    pieces: pieces.map((p, i) => ({
      slot: p.slot,
      itemId: p.itemId,
      acrossMm: r1(extents[i].across),
      minAcrossMm: r1(extents[i].min),
      widthRatio: extents[i].across > 0 ? squeezed[i] / extents[i].across : 1,
    })),
    relaxedMm: r1(relaxed),
    minMm: r1(min),
    availableMm: r1(availableMm),
    status,
  };
}

type Plane = { thicknessMm: number; minThicknessMm: number };

type StackFit = { relaxed: number; min: number; loft: number; status: FitStatus; ratios: number[] };

function fitStack(planes: readonly Plane[], maxLoft: number): StackFit {
  const thick = planes.map((p) => p.thicknessMm);
  const thin = planes.map((p) => Math.min(p.minThicknessMm, p.thicknessMm));
  const relaxed = thick.reduce((a, b) => a + b, 0);
  const min = thin.reduce((a, b) => a + b, 0);
  let status: FitStatus = "ok";
  let loft = relaxed;
  let squeezed = thick.slice();
  if (relaxed > maxLoft + 1e-9) {
    if (min <= maxLoft + 1e-9) {
      status = "compressed";
      loft = maxLoft;
    } else {
      status = "over";
      loft = min;
    }
    squeezed = shareSqueeze(thick, thin, relaxed - maxLoft);
  }
  return { relaxed, min, loft, status, ratios: thick.map((t, d) => (t > 0 ? squeezed[d] / t : 1)) };
}

function cellFit(
  section: Section,
  subSection: SubSection,
  layerFits: LayerFit[],
  stack: StackFit,
  maxLoft: number,
  thicknessRatios: number[],
  loftMm: number,
  loftLayers: number,
  settledInto: SubSection[] = [],
  pressed: { mm: number; by: SubSection[] } = { mm: 0, by: [] },
): CellFit {
  return {
    section,
    subSection,
    layers: layerFits,
    relaxedLoftMm: r1(stack.relaxed),
    minLoftMm: r1(stack.min),
    maxLoftMm: r1(maxLoft),
    loftMm: r1(loftMm),
    thicknessRatios,
    loftLayers,
    settledInto,
    pressedMm: r1(pressed.mm),
    pressedBy: pressed.by,
    status: worstStatus(
      layerFits.reduce((s, l) => worstStatus(s, l.status), stack.status),
      pressed.mm > 0 ? "compressed" : "ok",
    ),
  };
}

const PRESSED_MM = 0.5;

function pressedAlong(settled: readonly PieceSettle[], subSection: SubSection): { mm: number; by: SubSection[] } {
  let mm = 0;
  const by = new Set<SubSection>();
  const col = subSectionIndex(subSection);
  for (const a of settled) {
    if (a.subSection !== subSection) continue;
    const short = a.alongMm - a.settledLengthMm;
    if (short <= PRESSED_MM) continue;
    mm = Math.max(mm, short);
    const cols = settled.filter((b) => b.level === a.level && b.subSection !== subSection).map((b) => subSectionIndex(b.subSection));
    const front = Math.max(-1, ...cols.filter((c) => c < col));
    const back = Math.min(SUB_SECTIONS.length, ...cols.filter((c) => c > col));
    if (front >= 0) by.add(SUB_SECTIONS[front]);
    if (back < SUB_SECTIONS.length) by.add(SUB_SECTIONS[back]);
  }
  return { mm, by: SUB_SECTIONS.filter((s) => by.has(s)) };
}

type LayerPieces = readonly { slot: number; itemId: number; dims: PouchDimensions }[];

export function fitCell(
  section: Section,
  subSection: SubSection,
  layers: readonly LayerPieces[],
  availableWidthMm: number,
  maxLoft: number,
): CellFit {
  const planes = layers.map((l) => ({
    thicknessMm: Math.max(...l.map((p) => p.dims.thicknessMm)),
    minThicknessMm: Math.max(...l.map((p) => Math.min(p.dims.minThicknessMm, p.dims.thicknessMm))),
  }));
  const stack = fitStack(planes, maxLoft);
  const layerFits = layers.map((l, d) => fitLayer(l, availableWidthMm, d));
  return cellFit(section, subSection, layerFits, stack, maxLoft, stack.ratios, stack.loft, planes.length);
}

export function fitPillow(placements: PillowPlacement[], ctx: FitContext): PillowFit {
  const pillow = ctx.pillow ?? pillowDimensions(ctx.size).dims;
  const allowance = ctx.loftAllowance ?? LOFT_ALLOWANCE;
  const budget = maxLoftMm(pillow.gusset, allowance);
  const dimsOf = dimsAtSize(ctx.dims, pillow);
  const settle = settlePillow(placements, { size: ctx.size, dims: ctx.dims, pillow });
  const cells: CellFit[] = [];
  const sections = {} as Record<Section, SectionFit>;
  let status: FitStatus = "ok";
  SECTIONS.forEach((section, a) => {
    const settled = settle.pieces.filter((s) => s.section === section);
    const stacks = SUB_SECTIONS.map((subSection) => {
      const standing = settled.filter((s) => spans(s, subSection));
      if (standing.length === 0) return null;
      const depths = [...new Set(standing.map((s) => s.depth))].sort((x, y) => x - y);
      const planes = depths.map((d) => {
        const at = standing.filter((s) => s.depth === d);
        return {
          thicknessMm: Math.max(...at.map((s) => s.settledThicknessMm)),
          minThicknessMm: Math.max(...at.map((s) => Math.min(s.minThicknessMm, s.settledThicknessMm))),
        };
      });
      return { depths, standing, fit: fitStack(planes, budget[a]) };
    });
    const ratioAt = (b: number, depth: number) => {
      const stack = stacks[b];
      const i = stack ? stack.depths.indexOf(depth) : -1;
      return i < 0 ? 1 : stack!.fit.ratios[i];
    };
    const pieceRatio = new Map<string, number>();
    for (const s of settled) {
      let ratio = 1;
      for (let b = subSectionIndex(s.spanFrom); b <= subSectionIndex(s.spanTo); b++) ratio = Math.min(ratio, ratioAt(b, s.depth));
      pieceRatio.set(s.key, ratio);
    }
    const loftBySubSection = { front: 0, middle: 0, back: 0 } as Record<SubSection, number>;
    const columns = { front: null, middle: null, back: null } as Record<SubSection, ColumnFit | null>;
    let sectionStatus: FitStatus = "ok";
    SUB_SECTIONS.forEach((subSection, b) => {
      const stack = stacks[b];
      if (!stack) return;
      const drawn = (s: { settledThicknessMm: number; key: string }) => s.settledThicknessMm * (pieceRatio.get(s.key) ?? 1);
      const planes: ColumnPlane[] = stack.depths.map((depth) => {
        const at = stack.standing.filter((s) => s.depth === depth);
        const top = at.reduce((best, s) => (drawn(s) > drawn(best) ? s : best));
        const ratio = pieceRatio.get(top.key) ?? 1;
        return {
          depth,
          thicknessMm: r1(drawn(top)),
          settledMm: top.settledThicknessMm,
          minMm: top.minThicknessMm,
          ratio,
          itemId: top.itemId,
          status: stack.fit.status === "over" ? "over" : ratio < 1 - 1e-6 ? "compressed" : "ok",
        };
      });
      const loft = r1(planes.reduce((sum, pl) => sum + pl.thicknessMm, 0));
      loftBySubSection[subSection] = loft;
      columns[subSection] = {
        relaxedMm: r1(stack.fit.relaxed),
        minMm: r1(stack.fit.min),
        maxLoftMm: r1(budget[a]),
        loftMm: loft,
        status: stack.fit.status,
        planes,
      };
      sectionStatus = worstStatus(sectionStatus, stack.fit.status);
    });
    for (const [b, subSection] of SUB_SECTIONS.entries()) {
      const pieces = placements
        .filter((p) => p.section === section && p.subSection === subSection)
        .sort((x, y) => x.slot - y.slot);
      if (pieces.length === 0) continue;
      const layers = cellLayerGroups(pieces).map((l) => l.map((p) => ({ slot: p.slot, itemId: p.itemId, dims: dimsOf(p.itemId) })));
      const layerFits = layers.map((l, d) => fitLayer(l, pillow.sectionWidthsMm[a], d));
      const stack = stacks[b]!;
      const thicknessRatios = layers.map((l) => Math.min(...l.map((p) => pieceRatio.get(`${section}/${subSection}/${p.slot}`) ?? 1)));
      const settledInto = SUB_SECTIONS.filter(
        (other) => other !== subSection && settled.some((s) => s.subSection === subSection && spans(s, other)),
      );
      const cell = cellFit(
        section,
        subSection,
        layerFits,
        stack.fit,
        budget[a],
        thicknessRatios,
        loftBySubSection[subSection],
        stack.depths.length,
        settledInto,
        settle.active ? pressedAlong(settled, subSection) : undefined,
      );
      cells.push(cell);
      sectionStatus = worstStatus(sectionStatus, cell.status);
    }
    sections[section] = {
      section,
      widthMm: pillow.sectionWidthsMm[a],
      maxLoftMm: r1(budget[a]),
      loftBySubSection,
      columns,
      pieces: settled.map((s) => {
        const ratio = pieceRatio.get(s.key) ?? 1;
        const spanned = stacks.slice(subSectionIndex(s.spanFrom), subSectionIndex(s.spanTo) + 1);
        return {
          key: s.key,
          itemId: s.itemId,
          depth: s.depth,
          spanFrom: s.spanFrom,
          spanTo: s.spanTo,
          startMm: s.startMm,
          endMm: s.endMm,
          thicknessMm: r1(s.settledThicknessMm * ratio),
          status: spanned.some((st) => st?.fit.status === "over") ? "over" : ratio < 1 - 1e-6 ? "compressed" : "ok",
          ...(s.nudged ? { nudged: true as const } : {}),
        };
      }),
      status: sectionStatus,
    };
    status = worstStatus(status, sectionStatus);
  });
  return { size: pillow.size, loftAllowance: allowance, cells, sections, settle, status };
}

export type Cell = { section: Section; subSection: SubSection };

export type FitChange =
  | { kind: "add"; cell: Cell; itemId: number; layer: number | null }
  | { kind: "move"; from: Cell & { slot: number }; to: { cell: Cell; layer: number | null } };

const inCell = (p: PillowPlacement, cell: Cell) => p.section === cell.section && p.subSection === cell.subSection;

export function applyFitChange(placements: PillowPlacement[], change: FitChange): PillowPlacement[] {
  if (change.kind === "move") {
    const moving = placements.find((p) => inCell(p, change.from) && p.slot === change.from.slot);
    if (!moving) return placements;
    const without = placements.filter((p) => p !== moving);
    return applyFitChange(without, { kind: "add", cell: change.to.cell, itemId: moving.itemId, layer: change.to.layer });
  }
  const own = placements.filter((p) => inCell(p, change.cell));
  const layers = cellLayerGroups(own);
  const roomAt = layers.findIndex((l) => l.length < MAX_PIECES_PER_LAYER);
  const at = change.layer ?? (roomAt < 0 ? layers.length : roomAt);
  const used = new Set(own.map((p) => p.slot));
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return [...placements, { section: change.cell.section, subSection: change.cell.subSection, slot, itemId: change.itemId, row: Math.min(at, layers.length) }];
}

export function wouldFit(
  placements: PillowPlacement[],
  change: FitChange,
  ctx: FitContext,
): { fit: PillowFit; cell: CellFit | undefined } {
  const target = change.kind === "add" ? change.cell : change.to.cell;
  const fit = fitPillow(applyFitChange(placements, change), ctx);
  return { fit, cell: fit.cells.find((c) => c.section === target.section && c.subSection === target.subSection) };
}

export function fitMessage(cell: CellFit, size: string): string {
  const where = cellWhere(cell);
  const loftStatus = cell.relaxedLoftMm <= cell.maxLoftMm ? "ok" : cell.minLoftMm <= cell.maxLoftMm ? "compressed" : "over";
  const layer = cell.layers.find((l) => l.status === "over") ?? cell.layers.find((l) => l.status !== "ok");
  if (layer && worstStatus(loftStatus, layer.status) !== loftStatus) return layerFitMessage(cell, layer);
  if (loftStatus !== "ok") {
    const n = cell.loftLayers;
    return `${where}: ${n} ${n === 1 ? "layer needs" : "layers need"} ${Math.round(cell.relaxedLoftMm)} mm relaxed, ${Math.round(cell.minLoftMm)} mm fully compressed; Size ${size} holds ${Math.round(cell.maxLoftMm)} mm`;
  }
  if (cell.pressedMm > 0) {
    const sectionMm = Math.round(pillowDimensions(size).dims.lengthMm);
    return `${where}: pressed ${Math.round(cell.pressedMm)} mm shorter by ${cell.pressedBy.join(" and ")}, compressed; the pouches are longer together than the ${sectionMm} mm front to back of Size ${size}`;
  }
  return `${where}: fits`;
}

function cellWhere(cell: CellFit): string {
  return `${cell.section} · ${cell.subSection}${cell.settledInto.length ? ` (settled into ${cell.settledInto.join(" and ")})` : ""}`;
}

export function layerFitMessage(cell: CellFit, layer: LayerFit): string {
  const n = layer.pieces.length;
  return `${cellWhere(cell)} layer ${layer.depth + 1}: ${n} ${n === 1 ? "piece needs" : "pieces need"} ${Math.round(layer.relaxedMm)} mm relaxed, ${Math.round(layer.minMm)} mm fully squeezed; the ${cell.section} Section is ${Math.round(layer.availableMm)} mm wide`;
}

export type PieceFitStatus = { status: FitStatus; widthRatio: number; thicknessRatio: number };

const RELAXED: PieceFitStatus = { status: "ok", widthRatio: 1, thicknessRatio: 1 };

export function pieceFitStatus(fit: PillowFit, piece: { section: Section; subSection: SubSection; slot: number }, depth: number): PieceFitStatus {
  const cell = fit.cells.find((c) => c.section === piece.section && c.subSection === piece.subSection);
  if (!cell) return RELAXED;
  const layer = cell.layers[depth];
  const widthRatio = layer?.pieces.find((p) => p.slot === piece.slot)?.widthRatio ?? 1;
  const thicknessRatio = cell.thicknessRatios[depth] ?? 1;
  const loftOver = cell.minLoftMm > cell.maxLoftMm + 1e-9;
  const status: FitStatus =
    layer?.status === "over" || loftOver
      ? "over"
      : widthRatio < 1 - 1e-6 || thicknessRatio < 1 - 1e-6
        ? "compressed"
        : "ok";
  return { status, widthRatio, thicknessRatio };
}

export function overCells(fit: PillowFit): CellFit[] {
  return fit.cells.filter((c) => c.status === "over");
}

export function fitAtSizes(
  placements: PillowPlacement[],
  sizes: readonly string[],
  ctx: Omit<FitContext, "size">,
): Record<string, FitStatus> {
  const out: Record<string, FitStatus> = {};
  for (const size of sizes) out[size] = fitPillow(placements, { ...ctx, size }).status;
  return out;
}
