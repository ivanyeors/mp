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
  type PillowPlacement,
  type Section,
  type SubSection,
} from "./core";
import {
  GENERIC_POUCH,
  LOFT_ALLOWANCE,
  maxLoftMm,
  pillowDimensions,
  type PillowSize,
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";

export type FitStatus = "ok" | "compressed" | "over";

/** Seam between pressed pouches across a Section, mm. */
export const SEAM_MM = 2;

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
  /** Drawn thickness ÷ relaxed thickness per Layer, index = depth. */
  thicknessRatios: number[];
  /** The worse of the loft status and every Layer's width status. */
  status: FitStatus;
};

export type SectionFit = {
  section: Section;
  widthMm: number;
  maxLoftMm: number;
  /** Loft per sub-section, 0 where the cell is empty — the cross-section reads this. */
  loftBySubSection: Record<SubSection, number>;
  status: FitStatus;
};

export type PillowFit = {
  size: PillowSize;
  loftAllowance: number;
  /** Occupied cells only, in fixed cell order. */
  cells: CellFit[];
  sections: Record<Section, SectionFit>;
  /** The worst status anywhere. */
  status: FitStatus;
};

/** Slice 09 gives the Mbolster its own fit; the type exists so its renderer can compile against it. */
export type BolsterFit = {
  length: "short" | "medium" | "long";
  relaxedMm: number;
  minMm: number;
  availableMm: number;
  status: FitStatus;
};

export type FitContext = {
  /** Any case; unknown falls back to M. */
  size: string | null | undefined;
  /** item id → resolved dimensions; an absent id is the generic pouch. */
  dims?: ReadonlyMap<number, ResolvedDims>;
  /** Overrides the code default (a Settings value, slice 12). */
  loftAllowance?: number;
};

/** Extent across the Section (left ↔ right) and its floor, from the pouch's orientation. */
function acrossOf(d: PouchDimensions): { across: number; min: number } {
  const across = d.orientation === "along" ? d.lengthMm : d.widthMm;
  // The registry's minimum is for the width; a pouch lying along squeezes its
  // length by the same proportion.
  const floor = Math.min(d.minWidthMm, d.widthMm) / d.widthMm;
  return { across, min: across * floor };
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

/** One cell's loft budget across its Layers. */
export function fitCell(
  section: Section,
  subSection: SubSection,
  layers: readonly (readonly { slot: number; itemId: number; dims: PouchDimensions }[])[],
  availableWidthMm: number,
  maxLoft: number,
): CellFit {
  const thick = layers.map((l) => Math.max(...l.map((p) => p.dims.thicknessMm)));
  const thin = layers.map((l) => Math.max(...l.map((p) => Math.min(p.dims.minThicknessMm, p.dims.thicknessMm))));
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
  const layerFits = layers.map((l, d) => fitLayer(l, availableWidthMm, d));
  return {
    section,
    subSection,
    layers: layerFits,
    relaxedLoftMm: r1(relaxed),
    minLoftMm: r1(min),
    maxLoftMm: r1(maxLoft),
    loftMm: r1(loft),
    thicknessRatios: thick.map((t, d) => (t > 0 ? squeezed[d] / t : 1)),
    status: layerFits.reduce((s, l) => worstStatus(s, l.status), status),
  };
}

/**
 * The whole pillow: every occupied cell, a per-Section summary for the
 * cross-section, and the worst status. Deterministic: fixed cell order,
 * pieces sorted by slot, layers compacted exactly as the layout compacts them.
 */
export function fitPillow(placements: PillowPlacement[], ctx: FitContext): PillowFit {
  const { dims: pillow } = pillowDimensions(ctx.size);
  const allowance = ctx.loftAllowance ?? LOFT_ALLOWANCE;
  const budget = maxLoftMm(pillow.gusset, allowance);
  const dimsOf = (itemId: number): PouchDimensions => ctx.dims?.get(itemId)?.dims ?? GENERIC_POUCH;
  const cells: CellFit[] = [];
  const sections = {} as Record<Section, SectionFit>;
  let status: FitStatus = "ok";
  SECTIONS.forEach((section, a) => {
    const loftBySubSection = { front: 0, middle: 0, back: 0 } as Record<SubSection, number>;
    let sectionStatus: FitStatus = "ok";
    for (const subSection of SUB_SECTIONS) {
      const pieces = placements
        .filter((p) => p.section === section && p.subSection === subSection)
        .sort((x, y) => x.slot - y.slot);
      if (pieces.length === 0) continue;
      const layers = cellLayerGroups(pieces).map((l) => l.map((p) => ({ slot: p.slot, itemId: p.itemId, dims: dimsOf(p.itemId) })));
      const cell = fitCell(section, subSection, layers, pillow.sectionWidthsMm[a], budget[a]);
      cells.push(cell);
      loftBySubSection[subSection] = cell.loftMm;
      sectionStatus = worstStatus(sectionStatus, cell.status);
    }
    sections[section] = {
      section,
      widthMm: pillow.sectionWidthsMm[a],
      maxLoftMm: r1(budget[a]),
      loftBySubSection,
      status: sectionStatus,
    };
    status = worstStatus(status, sectionStatus);
  });
  return { size: pillow.size, loftAllowance: allowance, cells, sections, status };
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
 */
export function fitMessage(cell: CellFit, size: string): string {
  const where = `${cell.section} · ${cell.subSection}`;
  const loftStatus = cell.relaxedLoftMm <= cell.maxLoftMm ? "ok" : cell.minLoftMm <= cell.maxLoftMm ? "compressed" : "over";
  if (loftStatus !== "ok") {
    const n = cell.layers.length;
    return `${where}: ${n} ${n === 1 ? "layer needs" : "layers need"} ${Math.round(cell.relaxedLoftMm)} mm relaxed, ${Math.round(cell.minLoftMm)} mm fully compressed; Size ${size} holds ${Math.round(cell.maxLoftMm)} mm`;
  }
  const layer = cell.layers.find((l) => l.status !== "ok");
  if (layer) {
    const n = layer.pieces.length;
    return `${where} layer ${layer.depth + 1}: ${n} ${n === 1 ? "piece needs" : "pieces need"} ${Math.round(layer.relaxedMm)} mm relaxed, ${Math.round(layer.minMm)} mm fully squeezed; the ${cell.section} Section is ${Math.round(layer.availableMm)} mm wide`;
  }
  return `${where}: fits`;
}
