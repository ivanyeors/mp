/**
 * Physical fit model (ADR 0019, X-ray pillow UX slice 03). "Does this mix fit
 * this pillow?" answered with numbers, from the Placements plus the dimension
 * registry, on every read and never stored.
 *
 * - Per Layer: relaxed width = Σ across-axis extents + seams, against the
 *   Section's width for the Size. It fits (`ok`), fits only by squeezing each
 *   piece no further than its minimum (`compressed`), or does not fit even
 *   fully squeezed (`over`). The squeeze is shared pro rata by each piece's
 *   compressible range.
 * - Per cell: relaxed loft = Σ of each Layer's thickest piece, against the
 *   Section's max loft (the centre is one inch lower than the sides); the same
 *   three statuses, compression shared pro rata across Layers.
 * - Settled first (slice 11): the loft is judged per sub-section column on
 *   the settled thickness, so a stack that spills into an empty back is judged
 *   with that back, and a settled pouch stands in every column it spans.
 * - Advisory, never blocking: the renderer draws the squeeze, the editor warns.
 *
 * ponytail: pro-rata compression is the simplest deterministic rule; foam is
 * non-linear, and slice 10 calibrates against real builds before anything
 * cleverer is considered. Pure + browser-safe.
 */

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

/** The worse of two statuses. */
export function worstStatus(a: FitStatus, b: FitStatus): FitStatus {
  return RANK[b] > RANK[a] ? b : a;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export type PieceFit = {
  slot: number;
  itemId: number;
  /** The piece's relaxed extent across the Section (left ↔ right), mm. */
  acrossMm: number;
  /** Its extent when fully squeezed, mm. */
  minAcrossMm: number;
  /** Drawn width ÷ relaxed width: 1 when relaxed, ≥ minAcrossMm / acrossMm always. */
  widthRatio: number;
};

export type LayerFit = {
  /** 0 = top/front, increasing = deeper. */
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
  /** Σ of each Layer's thickest piece, relaxed. */
  relaxedLoftMm: number;
  /** Σ of each Layer's thickest piece, fully compressed. */
  minLoftMm: number;
  /** The Section's budget for this Size. */
  maxLoftMm: number;
  /** What the stack stands at: relaxed, the budget, or its minimum when over. */
  loftMm: number;
  /** Drawn thickness ÷ settled thickness per Layer, index = depth. */
  thicknessRatios: number[];
  /** Planes standing in this cell's column once settled: its own Layers, plus any a neighbour's fill spread in at another depth. */
  loftLayers: number;
  /** The other columns this cell's own pieces settled into (slice 11), front → back; the message names them. */
  settledInto: SubSection[];
  /**
   * Stuffed (9-11-2026): how much shorter, mm, the cell's most pressed pouch stands than its own length, pressed
   * end to end against the neighbours of its Layer because together they are longer than the room front to back;
   * 0 when they fit.
   */
  pressedMm: number;
  /** The neighbouring cells that press it, front → back. */
  pressedBy: SubSection[];
  /** The worse of the loft status, every Layer's width status, and compressed when its pouches are pressed shorter. */
  status: FitStatus;
};

/** One plane of a sub-section column's stack, as drawn: the thickest piece standing in it at that depth. */
export type ColumnPlane = {
  depth: number;
  /** Drawn thickness: settled × the piece's ratio, mm. */
  thicknessMm: number;
  /** The thickness before the loft squeeze (settled), mm. */
  settledMm: number;
  minMm: number;
  ratio: number;
  /** The piece that sets this plane's thickness — the cross-section colours the slab by its family. */
  itemId: number;
  status: FitStatus;
};

/** A sub-section column's stack once settled (slice 05 reads it): every piece standing in the column, one plane per depth. */
export type ColumnFit = {
  relaxedMm: number;
  minMm: number;
  maxLoftMm: number;
  /** What the column stands at: Σ of its planes as drawn. */
  loftMm: number;
  status: FitStatus;
  planes: ColumnPlane[];
};

/** One settled piece seen along its Section: where it lies front → back and how thick it draws. */
export type SectionPieceFit = {
  key: string;
  itemId: number;
  depth: number;
  spanFrom: SubSection;
  spanTo: SubSection;
  startMm: number;
  endMm: number;
  /** Settled × the tightest squeeze of the columns it spans, mm. */
  thicknessMm: number;
  status: FitStatus;
  /** Nudged front ↔ back by hand (a fine offset): the soft cut holds it where it was put. */
  nudged?: true;
};

export type SectionFit = {
  section: Section;
  widthMm: number;
  maxLoftMm: number;
  /** Loft per sub-section, 0 where the column is empty — the cross-section reads this. */
  loftBySubSection: Record<SubSection, number>;
  /** The stack behind each of those numbers; null where the column is empty. */
  columns: Record<SubSection, ColumnFit | null>;
  /** Every settled piece once, as the along cut draws it. */
  pieces: SectionPieceFit[];
  status: FitStatus;
};

export type PillowFit = {
  size: PillowSize;
  loftAllowance: number;
  /** Occupied cells only, in fixed cell order. */
  cells: CellFit[];
  sections: Record<Section, SectionFit>;
  /** Where every piece stands once settled (slice 11) — the layout draws from it. */
  settle: PillowSettle;
  /** The worst status anywhere. */
  status: FitStatus;
};

/** One Mbolster pouch's fit: its width along the capsule (settled, then squeezed) and its thickness against the diameter. */
export type BolsterPieceFit = PieceFit &
  BolsterPieceSettle & {
    /** `over` when even fully compressed it is thicker than the bolster; `compressed` when it must squeeze to fit. */
    thicknessStatus: FitStatus;
  };

/**
 * The Mbolster's fit (slice 09): pouches settled into the capsule's empty
 * ends, then Σ widths + seams against the capsule length (`ok` /
 * `compressed` / `over`, the squeeze shared pro rata), and each pouch's
 * thickness against the diameter. The cap is physical and derived — never a
 * slot number (ADR 0008 amendment).
 */
export type BolsterFit = {
  length: BolsterLength;
  lengthMm: number;
  diameterMm: number;
  /** Σ settled widths + seams, mm. */
  relaxedMm: number;
  /** Σ minimum widths + seams, mm. */
  minMm: number;
  /** The capsule length, mm. */
  availableMm: number;
  /** What the pack stands at along the capsule: Σ drawn widths + seams, mm. */
  usedMm: number;
  /** In slot order. */
  pieces: BolsterPieceFit[];
  /** The width status along the capsule alone. */
  lengthStatus: FitStatus;
  /** The worse of the length status and every pouch's thickness status. */
  status: FitStatus;
};

export type BolsterFitContext = {
  /** item id → resolved dimensions; an absent id is the generic pouch. */
  dims?: ReadonlyMap<number, ResolvedDims>;
  /** The capsule when it is not the registry's (a test). */
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

/** The Mbolster's fit message: the length first, then the first pouch too thick for the diameter; `fits` otherwise. */
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
  /** Any case; unknown falls back to M. */
  size: string | null | undefined;
  /** item id → resolved dimensions; an absent id is the generic pouch. */
  dims?: ReadonlyMap<number, ResolvedDims>;
  /** Overrides the code default (a Settings value, slice 12). */
  loftAllowance?: number;
  /** The Size's geometry when it is not the registry's (a walled product, a test). */
  pillow?: PillowDimensions;
};

/** Extent across the Section (left ↔ right) and its floor. */
function acrossOf(d: PouchDimensions): { across: number; min: number } {
  return { across: d.widthMm, min: Math.min(d.minWidthMm, d.widthMm) };
}

/**
 * Share a squeeze across members pro rata by their compressible range. Returns
 * each member's squeezed extent; when the squeeze exceeds the total range every
 * member sits at its floor.
 */
function shareSqueeze(relaxed: number[], floors: number[], squeeze: number): number[] {
  const ranges = relaxed.map((r, i) => Math.max(r - floors[i], 0));
  const total = ranges.reduce((a, b) => a + b, 0);
  if (squeeze <= 0) return relaxed.slice();
  if (total <= 0 || squeeze >= total) return floors.slice();
  return relaxed.map((r, i) => r - (squeeze * ranges[i]) / total);
}

/** One Layer's width budget against the Section width. */
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

/** One plane of a column's stack: the thickest piece standing in it, relaxed and fully compressed. */
type Plane = { thicknessMm: number; minThicknessMm: number };

type StackFit = { relaxed: number; min: number; loft: number; status: FitStatus; ratios: number[] };

/** One column's loft budget across its planes: the three statuses, compression shared pro rata. */
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

/** A pouch pressed less than this much shorter than its own length is not pressed (the settle rounds to 0.1 mm). */
const PRESSED_MM = 0.5;

/**
 * Stuffed: how much shorter than its own length a cell's most pressed pouch
 * stands, pressed end to end against the neighbours at its height in the stack
 * (`packLayer`), and which cells press it — the nearest one holding a pouch at
 * that height on either side. Pieces higher or lower lie over or under it.
 */
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

/** One cell's loft budget across its Layers, as authored (no neighbour settles in). */
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

/**
 * The whole pillow: every occupied cell, a per-Section summary for the
 * cross-section, and the worst status. Settled first (slice 11): each
 * sub-section column's stack is every piece whose settled span covers it, one
 * plane per depth, judged on settled thickness; a piece draws at the tightest
 * ratio of the columns it spans. Deterministic: fixed cell order, pieces
 * sorted by slot, layers compacted exactly as the layout compacts them.
 */
export function fitPillow(placements: PillowPlacement[], ctx: FitContext): PillowFit {
  const pillow = ctx.pillow ?? pillowDimensions(ctx.size).dims;
  const allowance = ctx.loftAllowance ?? LOFT_ALLOWANCE;
  const budget = maxLoftMm(pillow.gusset, allowance);
  // Pouches scale to the Size (M is the reference), as the settle and the layout read them.
  const dimsOf = dimsAtSize(ctx.dims, pillow);
  const settle = settlePillow(placements, { size: ctx.size, dims: ctx.dims, pillow });
  const cells: CellFit[] = [];
  const sections = {} as Record<Section, SectionFit>;
  let status: FitStatus = "ok";
  SECTIONS.forEach((section, a) => {
    const settled = settle.pieces.filter((s) => s.section === section);
    // Column stacks: every piece standing in the column, one plane per depth.
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
    // A piece draws at the tightest ratio of the columns it spans.
    const pieceRatio = new Map<string, number>();
    for (const s of settled) {
      let ratio = 1;
      for (let b = subSectionIndex(s.spanFrom); b <= subSectionIndex(s.spanTo); b++) ratio = Math.min(ratio, ratioAt(b, s.depth));
      pieceRatio.set(s.key, ratio);
    }
    // What each column stands at: its planes as drawn, each the thickest piece
    // standing at that depth once squeezed — Σ is the column's loft.
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
        // A walled product's cells cut a pouch to the cell; nothing presses it there.
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

// --- Hypothetical changes ------------------------------------------------------

export type Cell = { section: Section; subSection: SubSection };

export type FitChange =
  | { kind: "add"; cell: Cell; itemId: number; layer: number | null }
  | { kind: "move"; from: Cell & { slot: number }; to: { cell: Cell; layer: number | null } };

const inCell = (p: PillowPlacement, cell: Cell) => p.section === cell.section && p.subSection === cell.subSection;

/**
 * The placements after `change`, for the fit alone: `layer: null` means the
 * topmost Layer with room, else a new one under the deepest — the same
 * resolution `addPiece` uses, without its caps (those refuse before the fit is
 * ever consulted). A move re-adds the piece in its new cell and Layer.
 */
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

/** The fit of the pillow after a change, plus the changed cell's fit — the add / move refusal reads this. */
export function wouldFit(
  placements: PillowPlacement[],
  change: FitChange,
  ctx: FitContext,
): { fit: PillowFit; cell: CellFit | undefined } {
  const target = change.kind === "add" ? change.cell : change.to.cell;
  const fit = fitPillow(applyFitChange(placements, change), ctx);
  return { fit, cell: fit.cells.find((c) => c.section === target.section && c.subSection === target.subSection) };
}

// --- Messages ------------------------------------------------------------------

/**
 * `"center · middle: 3 layers need 95 mm relaxed, 70 mm fully compressed; Size M holds 60 mm"`
 * for a loft problem; the same shape per Layer for a width problem; `fits` otherwise.
 * The worse problem speaks: a Layer too wide to close outranks a stack that
 * only compresses, so a cell that cannot close never reads as one that fits.
 */
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

/** One Layer's width problem: `"center · back layer 1: 2 pieces need 332 mm relaxed, …"`. */
export function layerFitMessage(cell: CellFit, layer: LayerFit): string {
  const n = layer.pieces.length;
  return `${cellWhere(cell)} layer ${layer.depth + 1}: ${n} ${n === 1 ? "piece needs" : "pieces need"} ${Math.round(layer.relaxedMm)} mm relaxed, ${Math.round(layer.minMm)} mm fully squeezed; the ${cell.section} Section is ${Math.round(layer.availableMm)} mm wide`;
}

// --- Feedback helpers (slice 04) ----------------------------------------------

/** A piece's own squeeze, for the drawing: its Layer's width status and its cell's thickness ratio at its depth. */
export type PieceFitStatus = { status: FitStatus; widthRatio: number; thicknessRatio: number };

const RELAXED: PieceFitStatus = { status: "ok", widthRatio: 1, thicknessRatio: 1 };

/**
 * `over` when the piece's Layer does not fit across even fully squeezed or its
 * cell cannot close even fully compressed; `compressed` when it draws squeezed
 * either way; `ok` otherwise.
 */
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

/** The cells that cannot close even fully compressed — the save confirm lists these. */
export function overCells(fit: PillowFit): CellFit[] {
  return fit.cells.filter((c) => c.status === "over");
}

/** The same recipe judged at each Size — the Size membership chips' fit dots. O(pieces) per Size. */
export function fitAtSizes(
  placements: PillowPlacement[],
  sizes: readonly string[],
  ctx: Omit<FitContext, "size">,
): Record<string, FitStatus> {
  const out: Record<string, FitStatus> = {};
  for (const size of sizes) out[size] = fitPillow(placements, { ...ctx, size }).status;
  return out;
}
