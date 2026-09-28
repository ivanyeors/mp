/**
 * X-ray layout engine (ADR 0009 guardrail 3): deterministic slot layout for
 * 1–5 pieces per cell. Same placements → identical positions, always — Staff
 * compare the x-ray against the physical build. Pure, no I/O.
 *
 * Slice 02 (ADR 0019): every piece is drawn at its registry footprint,
 * `mm × k` for the pillow Size, as the fit judges it (Ivan, 28-9-2026: a small
 * filling must read smaller than a large one, and must not stretch to fill
 * the space it leaves). The 26-9-2026 fill-the-compartment drawing is
 * retired for the pillow; the Mbolster keeps it. A layer's pieces sit side by
 * side, a seam apart, centred in their slab — the fit's squeeze narrows them,
 * and a layer that still cannot fit shares the slab pro rata. Each pouch then
 * moves by its fine offset (slice 08) within the room the others leave.
 * Depth is the layer's real thickness, foreshortened.
 *
 * Slice 11: every piece also carries its SETTLED rect — the authored rect
 * spread front/back into the empty neighbouring sub-sections the fit's settle
 * pass says it fills — and a settled stack steps by its settled thickness.
 */

import {
  cellLayerGroups,
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
  PILLOW_DIMENSIONS,
  sizeFactors,
  type BolsterDimensions,
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";
import type { BolsterFit, CellFit, PillowFit } from "./fit";
import type { PieceSettle } from "./settle";
import { stageGeometry, XRAY_VIEW, type StageGeometry } from "./xray-stage";

export { XRAY_VIEW };

const M_STAGE = () => stageGeometry("M");

/**
 * Nominal 3×3 grid boundaries of the M stage (columns = Sections, rows =
 * sub-sections). Every other Size reads its own from `stageGeometry(size)`.
 */
export const COL_X: readonly [number, number, number, number] = M_STAGE().colX;
export const ROW_Y: readonly [number, number, number, number] = M_STAGE().rowY;

/**
 * Hair of padding between the shell and the fillings: pouches run to the
 * compartment walls and the silhouette/cell clips mold them to the shape.
 */
const INSET = 1;
/** Seam between pressed pouches, in view units (also the cell-divider seam). */
export const GAP = 1;

export type CellFrame = { x: number; y: number; w: number; h: number };

export function cellFrame(section: Section, subSection: SubSection, stage: StageGeometry = M_STAGE()): CellFrame {
  const a = SECTIONS.indexOf(section);
  const b = SUB_SECTIONS.indexOf(subSection);
  return {
    x: stage.colX[a] + INSET,
    y: stage.rowY[b] + INSET,
    w: stage.colX[a + 1] - stage.colX[a] - 2 * INSET,
    h: stage.rowY[b + 1] - stage.rowY[b] - 2 * INSET,
  };
}

/** Piece rect in view coordinates (shape assets are normalized to 100×100). */
export type PieceRect = { x: number; y: number; w: number; h: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Depth is drawn as a foreshortened offset: each layer shifts the next one down
 * (and a hair right) by its thickest piece × k × FORESHORTEN, so a stack of
 * thick pouches reads deeper than a stack of thin ones. A slab loses only its
 * own offset, so the top layer keeps the whole cell and draws at true scale
 * whatever lies under it. The whole stack never drops further than
 * MAX_STACK_DROP of the cell, so the deepest slab stays in the cell whatever
 * is piled on it.
 */
const FORESHORTEN = 0.5;
const DEPTH_DX = 0.5;
const MAX_STACK_DROP = 0.5;

/** Slab rects per layer (index 0 = top/front), offset by the layers above it. */
function depthSlabs(frame: CellFrame, thicknessesMm: number[], k: number): PieceRect[] {
  const offsets = [0];
  for (let d = 1; d < thicknessesMm.length; d++) {
    offsets.push(offsets[d - 1] + thicknessesMm[d - 1] * k * FORESHORTEN);
  }
  const total = offsets[offsets.length - 1];
  const scale = total > frame.h * MAX_STACK_DROP ? (frame.h * MAX_STACK_DROP) / total : 1;
  return offsets.map((o) => ({
    x: r1(frame.x + o * scale * DEPTH_DX),
    y: r1(frame.y + o * scale),
    w: r1(frame.w - o * scale * DEPTH_DX),
    h: r1(frame.h - o * scale),
  }));
}

/** A pouch's drawn footprint: the long axis across the Section unless it lies along it. */
function footprint(dims: PouchDimensions, k: number): { w: number; h: number } {
  return dims.orientation === "along"
    ? { w: dims.lengthMm * k, h: dims.widthMm * k }
    : { w: dims.widthMm * k, h: dims.lengthMm * k };
}

/**
 * Fill pack of one layer: the slab width, less the seams, is split by each
 * piece's footprint width (× the fit's squeeze ratio when given), left→right
 * in slot order, and every piece fills its tract and the slab's length — the
 * conform pass molds it to the shell. Nothing can overflow: an `over` layer
 * simply shares the wall-to-wall width, and the fit says it cannot close.
 */
function packFill(slab: CellFrame, pieces: PouchDimensions[], k: number, widthRatios?: readonly number[]): PieceRect[] {
  const seams = GAP * (pieces.length - 1);
  const weights = pieces.map((d, i) => footprint(d, k).w * (widthRatios?.[i] ?? 1));
  const total = weights.reduce((sum, w) => sum + w, 0) || 1;
  const avail = Math.max(slab.w - seams, 1);
  let x = slab.x;
  return weights.map((weight) => {
    const w = (avail * weight) / total;
    const rect = { x: r1(x), y: r1(slab.y), w: r1(w), h: r1(slab.h) };
    x += w + GAP;
    return rect;
  });
}

/** A drawn pouch in its slab: its rect, where it sits un-nudged, and how far it can go. */
type TruePack = { rect: PieceRect; home: { x: number; y: number }; range: NudgeRange };

/** The top-left corners a pouch may take in its slab, view units — the room its neighbours leave it. */
export type NudgeRange = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * True-scale pack of one layer (slice 02, 28-9-2026): each piece at its
 * footprint (× the fit's squeeze), the row centred in the slab with a seam
 * between pieces, slot order left → right; a piece longer than the slab is
 * cut to it. A piece's fine offset (mm × k) moves it from home within its
 * range — the slab less the room its neighbours need — and a piece that is
 * moved into a neighbour pushes it along, so order and seams always hold.
 */
function packTrue(
  slab: CellFrame,
  pieces: PouchDimensions[],
  k: number,
  widthRatios: readonly number[] | undefined,
  offsets: ReadonlyArray<{ x: number; y: number }>,
): TruePack[] {
  const seams = GAP * (pieces.length - 1);
  const feet = pieces.map((d, i) => {
    const f = footprint(d, k);
    return { w: f.w * (widthRatios?.[i] ?? 1), h: Math.min(f.h, slab.h) };
  });
  const sum = feet.reduce((t, f) => t + f.w, 0);
  // Over even after the squeeze: the row shares the slab pro rata (the fit says it cannot close).
  const shrink = sum + seams > slab.w && sum > 0 ? Math.max(slab.w - seams, 1) / sum : 1;
  const ws = feet.map((f) => f.w * shrink);
  const row = ws.reduce((t, w) => t + w, 0) + seams;
  const start = slab.x + (slab.w - row) / 2;
  const before = (i: number) => ws.slice(0, i).reduce((t, w) => t + w + GAP, 0);
  const after = (i: number) => ws.slice(i + 1).reduce((t, w) => t + w + GAP, 0);
  let prevRight = -Infinity;
  return ws.map((w, i) => {
    const h = feet[i].h;
    const home = { x: start + before(i), y: slab.y + (slab.h - h) / 2 };
    const range = {
      minX: slab.x + before(i),
      maxX: slab.x + slab.w - after(i) - w,
      minY: slab.y,
      maxY: slab.y + slab.h - h,
    };
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
    // Push right past the previous piece; the ranges guarantee it still fits.
    const x = Math.max(clamp(home.x + offsets[i].x * k, range.minX, range.maxX), prevRight + GAP);
    const y = clamp(home.y + offsets[i].y * k, range.minY, range.maxY);
    prevRight = x + w;
    return {
      rect: { x: r1(x), y: r1(y), w: r1(w), h: r1(h) },
      home: { x: r1(home.x), y: r1(home.y) },
      range: { minX: r1(range.minX), maxX: r1(range.maxX), minY: r1(range.minY), maxY: r1(range.maxY) },
    };
  });
}

export type PieceLayout = {
  key: string;
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
  /** The piece's layer: 0 = top/front, increasing = deeper. */
  depth: number;
  /**
   * The rect once the fill has settled (slice 11): the authored rect spread
   * front/back into the empty neighbouring sub-sections, anchored at its
   * authored end. The authored rect itself when nothing spreads.
   */
  settled: PieceRect;
  /** Top-left corner un-nudged (slice 08): the fine offset is measured from here. */
  home: { x: number; y: number };
  /** The corners the pouch can take in its slab, for a drag to clamp to. */
  range: NudgeRange;
} & PieceRect;

/** The authored rect spread by the settle pass, kept inside the Section (INSET in from the body ends). */
function settledRect(rect: PieceRect, s: PieceSettle, stage: StageGeometry): PieceRect {
  const top = Math.max(stage.rowY[0] + INSET, rect.y - s.spreadFrontMm * stage.k);
  const bottom = Math.min(stage.rowY[3] - INSET, rect.y + rect.h + s.spreadBackMm * stage.k);
  return { x: rect.x, y: r1(top), w: rect.w, h: r1(Math.max(bottom - top, rect.h)) };
}

/** What the pillow layout needs beyond the placements: the Size's stage, each item's dimensions and the fit. */
export type LayoutContext = {
  /** Defaults to the M stage. */
  stage?: StageGeometry;
  /** item id → resolved dimensions; an absent id draws as the generic pouch. */
  dims?: ReadonlyMap<number, ResolvedDims>;
  /** The fit computed once by the caller (slice 03): squeezed widths and thicknesses are drawn as such. */
  fit?: PillowFit;
};

/**
 * Deterministic layout: fixed cell order, pieces sorted by slot within a cell,
 * each layer's pieces drawn at their registry footprints for the Size.
 */
export function layoutPlacements(placements: PillowPlacement[], ctx: LayoutContext = {}): PieceLayout[] {
  const stage = ctx.stage ?? M_STAGE();
  // The pouch as it sits in this Size (M is the reference): the same door the fit and settle use.
  const dimsOf = dimsAtSize(ctx.dims, PILLOW_DIMENSIONS[stage.size]);
  const sizeF = sizeFactors(PILLOW_DIMENSIONS[stage.size]);
  const settleOf = new Map<string, PieceSettle>();
  if (ctx.fit?.settle.active) for (const s of ctx.fit.settle.pieces) settleOf.set(s.key, s);
  const out: PieceLayout[] = [];
  for (const section of SECTIONS) {
    for (const subSection of SUB_SECTIONS) {
      const pieces = placements
        .filter((p) => p.section === section && p.subSection === subSection)
        .sort((a, b) => a.slot - b.slot);
      if (pieces.length === 0) continue;
      const frame = cellFrame(section, subSection, stage);
      // Layers compacted exactly as the fit model compacts them (core.cellLayerGroups).
      const layers = cellLayerGroups(pieces);
      const cellFit: CellFit | undefined = ctx.fit?.cells.find(
        (c) => c.section === section && c.subSection === subSection,
      );
      // A Layer steps by its thickest piece's SETTLED thickness (a spread pouch is thinner), then the fit's squeeze.
      const slabs = depthSlabs(
        frame,
        layers.map(
          (list, d) =>
            Math.max(
              ...list.map(
                (p) => settleOf.get(`${section}/${subSection}/${p.slot}`)?.settledThicknessMm ?? dimsOf(p.itemId).thicknessMm,
              ),
            ) * (cellFit?.thicknessRatios[d] ?? 1),
        ),
        stage.k,
      );
      // Emit deepest-first so the renderer paints the top layer last (on top).
      for (let d = layers.length - 1; d >= 0; d--) {
        const packed = packTrue(
          slabs[d],
          layers[d].map((p) => dimsOf(p.itemId)),
          stage.k,
          cellFit?.layers[d]?.pieces.map((p) => p.widthRatio),
          // Offsets are M millimetres too, so a pouch pushed to the edge stays at the edge at every Size.
          layers[d].map((p) => ({ x: (p.offsetXMm ?? 0) * sizeF.across, y: (p.offsetYMm ?? 0) * sizeF.along })),
        );
        layers[d].forEach((piece, idx) => {
          const key = `${section}/${subSection}/${piece.slot}`;
          const s = settleOf.get(key);
          const { rect, home, range } = packed[idx];
          out.push({
            key,
            section,
            subSection,
            slot: piece.slot,
            itemId: piece.itemId,
            depth: d,
            ...rect,
            settled: s && (s.spreadFrontMm > 0 || s.spreadBackMm > 0) ? settledRect(rect, s, stage) : rect,
            home,
            range,
          });
        });
      }
    }
  }
  return out;
}

// --- Mbolster: single long compartment (ADR 0008 amendment, slice 13; true scale, slice 09) --

export type BolsterLength = "short" | "medium" | "long";

/** Capsule total length per Mbolster length, in the shared 664×374 view. */
export const BOLSTER_CAPSULE_LENGTHS: Record<BolsterLength, number> = {
  short: 460,
  medium: 560,
  long: 640,
};

/** The capsule height before slice 09 — kept as the reference the tests and thumbnails compare against. */
export const BOLSTER_CAPSULE_HEIGHT = 180;

export type BolsterStage = {
  length: BolsterLength;
  /** View units per millimetre for this length: the capsule fills its view length. */
  k: number;
  lengthView: number;
  /** The registry diameter × k: a long bolster draws thinner than a short one, as it is. */
  heightView: number;
  x0: number;
  cy: number;
};

/**
 * The bolster's stage (slice 09): `k = capsule view length / lengthMm` per
 * length, the height the registry diameter at that scale, so every pouch is
 * drawn at `mm × k` along the capsule.
 */
export function bolsterStage(length: BolsterLength, bolster: BolsterDimensions = BOLSTER_DIMENSIONS[length]): BolsterStage {
  const lengthView = BOLSTER_CAPSULE_LENGTHS[length];
  const k = lengthView / bolster.lengthMm;
  const heightView = Math.min(r1(bolster.diameterMm * k), XRAY_VIEW.height - 40);
  return { length, k, lengthView, heightView, x0: (XRAY_VIEW.width - lengthView) / 2, cy: XRAY_VIEW.height / 2 };
}

/**
 * Inner content frame of the capsule — full bleed into the rounded ends: the
 * capsule clip molds the end pouches to the curve (conform, no dead margin).
 */
export function bolsterFrame(length: BolsterLength): CellFrame {
  const stage = bolsterStage(length);
  return {
    x: stage.x0 + INSET,
    y: stage.cy - stage.heightView / 2 + INSET,
    w: stage.lengthView - 2 * INSET,
    h: stage.heightView - 2 * INSET,
  };
}

export type BolsterPieceLayout = {
  key: string;
  slot: number;
  itemId: number;
} & PieceRect;

/** What the bolster layout needs beyond the placements: each item's dimensions and the fit. */
export type BolsterLayoutContext = {
  dims?: ReadonlyMap<number, ResolvedDims>;
  /** The fit computed once by the caller (slice 09): settled widths and the squeeze draw as such. */
  fit?: BolsterFit;
};

/**
 * Deterministic bolster layout: pieces sorted by slot, packed edge-to-edge in
 * a SINGLE line along the capsule — the physical bolster can't stack a second
 * layer. The line fills the capsule (Ivan, 26-9-2026: a bolster reads fully
 * stuffed): its length is split by each pouch's settled width × the fit's
 * ratio, its short axis fills the diameter, the end pouches conform to the
 * caps — the fit says whether the pack is relaxed, compressed or over.
 */
export function layoutBolsterPlacements(
  placements: BolsterPlacement[],
  length: BolsterLength,
  ctx: BolsterLayoutContext = {},
): BolsterPieceLayout[] {
  const pieces = [...placements].sort((a, b) => a.slot - b.slot);
  if (pieces.length === 0) return [];
  const stage = bolsterStage(length);
  const dimsOf = (itemId: number): PouchDimensions => ctx.dims?.get(itemId)?.dims ?? GENERIC_POUCH;
  const fitOf = new Map((ctx.fit?.pieces ?? []).map((p) => [p.slot, p] as const));
  // The width axis runs along the capsule whatever the pillow orientation says.
  const drawn = pieces.map((p) => {
    const d = dimsOf(p.itemId);
    return { ...d, orientation: "across" as const, widthMm: fitOf.get(p.slot)?.settledWidthMm ?? d.widthMm };
  });
  const rects = packFill(
    bolsterFrame(length),
    drawn,
    stage.k,
    pieces.map((p) => fitOf.get(p.slot)?.widthRatio ?? 1),
  );
  return pieces.map((piece, idx) => ({
    key: `compartment/${piece.slot}`,
    slot: piece.slot,
    itemId: piece.itemId,
    ...rects[idx],
  }));
}
