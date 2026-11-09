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
 *
 * Front ↔ back is the settle's, to the millimetre (linked views, 7-11-2026):
 * every pouch stands where `settlePillow` says it starts and ends — the very
 * numbers the cross-section draws — so a pouch moved in either view is in
 * the same place in both. Depth is drawn across only (a deeper Layer sits a
 * little to the right, darker), so it never shifts a pouch along.
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
import { extentAlong, settlePillow, type PieceSettle } from "./settle";
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
 * Depth is drawn as a foreshortened offset: each layer shifts the next one
 * right by its thickest piece × k × FORESHORTEN × DEPTH_DX, so a stack of
 * thick pouches reads deeper than a stack of thin ones. Only across: front ↔
 * back is the settle's, which the cross-section draws too (the slab's own
 * along drop is no longer used for the pouches). A slab loses only its own
 * offset, so the top layer keeps the whole cell whatever lies under it, and
 * the whole stack never shifts further than MAX_STACK_DROP of the cell.
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

/** A pouch's drawn footprint: width across the Section, length along it. */
function footprint(dims: PouchDimensions, k: number): { w: number; h: number } {
  return { w: dims.widthMm * k, h: dims.lengthMm * k };
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

/** A drawn pouch across its slab: its left edge and width, where it sits un-nudged, and how far it can go. */
type AcrossPack = { x: number; w: number; homeX: number; minX: number; maxX: number };

/** The top-left corners a pouch may take, view units: across, the room its neighbours leave it; front ↔ back, its reach. */
export type NudgeRange = { minX: number; maxX: number; minY: number; maxY: number };

/**
 * True-scale pack of one layer across its slab (slice 02, 28-9-2026): each
 * piece at its footprint width (× the fit's squeeze), the row centred in the
 * slab with a seam between pieces, slot order left → right. A piece's fine
 * across offset (mm × k) moves it from home within the slab less the room its
 * neighbours need, and a piece moved into a neighbour pushes it along, so
 * order and seams always hold. Front ↔ back is the settle's, not this.
 */
function packAcross(
  slab: CellFrame,
  pieces: PouchDimensions[],
  k: number,
  widthRatios: readonly number[] | undefined,
  offsetsX: readonly number[],
  /** The pillow's own left and right edges, view units: a roll alone in its Layer may reach that far. */
  pillowX?: readonly [number, number],
): AcrossPack[] {
  // A Neck support alone in its Layer is laid at its own length (Ivan, 9-11-2026: "full length"), centred on its
  // Section, reaching over the side Sections if it is longer than its own; the fit still says it does not fit.
  if (pillowX && pieces.length === 1) {
    // Never past the pillow's own sides: a roll in a side Section is pushed in from the outer wall, and a nudge
    // moves it from there.
    const w = Math.min(footprint(pieces[0], k).w, pillowX[1] - pillowX[0]);
    const minX = pillowX[0];
    const maxX = pillowX[1] - w;
    const homeX = Math.min(Math.max(slab.x + (slab.w - w) / 2, minX), maxX);
    const x = Math.min(Math.max(homeX + offsetsX[0] * k, minX), maxX);
    return [{ x: r1(x), w: r1(w), homeX: r1(homeX), minX: r1(minX), maxX: r1(maxX) }];
  }
  const seams = GAP * (pieces.length - 1);
  const feet = pieces.map((d, i) => footprint(d, k).w * (widthRatios?.[i] ?? 1));
  const sum = feet.reduce((t, w) => t + w, 0);
  // Over even after the squeeze: the row shares the slab pro rata (the fit says it cannot close).
  const shrink = sum + seams > slab.w && sum > 0 ? Math.max(slab.w - seams, 1) / sum : 1;
  const ws = feet.map((w) => w * shrink);
  const row = ws.reduce((t, w) => t + w, 0) + seams;
  const start = slab.x + (slab.w - row) / 2;
  const before = (i: number) => ws.slice(0, i).reduce((t, w) => t + w + GAP, 0);
  const after = (i: number) => ws.slice(i + 1).reduce((t, w) => t + w + GAP, 0);
  let prevRight = -Infinity;
  return ws.map((w, i) => {
    const homeX = start + before(i);
    const minX = slab.x + before(i);
    const maxX = slab.x + slab.w - after(i) - w;
    // Push right past the previous piece; the ranges guarantee it still fits.
    const x = Math.max(Math.min(Math.max(homeX + offsetsX[i] * k, minX), Math.max(minX, maxX)), prevRight + GAP);
    prevRight = x + w;
    return { x: r1(x), w: r1(w), homeX: r1(homeX), minX: r1(minX), maxX: r1(maxX) };
  });
}

/**
 * An extent along the Section (mm from its front, `cellMm` to a sub-section)
 * as view y, a hair in from each end so two pouches that meet read as two.
 * Through the stage's own rows, so a pouch that fills its cell draws exactly
 * as the cell frame does; an end within a rounding of a row is on it.
 */
function alongRect(stage: StageGeometry, cellMm: number, startMm: number, endMm: number): { y: number; h: number } {
  const yOf = (mm: number) => {
    const b = Math.min(Math.max(Math.floor(mm / cellMm), 0), SUB_SECTIONS.length - 1);
    for (const row of [b, b + 1]) if (Math.abs(mm - row * cellMm) < 0.15) return stage.rowY[row];
    return stage.rowY[b] + ((mm - b * cellMm) * (stage.rowY[b + 1] - stage.rowY[b])) / cellMm;
  };
  // A hair in only where an end meets a cell's edge (a neighbour's, or the Section's end): a pouch clear of both keeps its true length.
  const onRow = (mm: number) => Math.abs(mm / cellMm - Math.round(mm / cellMm)) * cellMm < 0.15;
  const y0 = Math.max(stage.rowY[0] + INSET, yOf(startMm) + (onRow(startMm) ? INSET : 0));
  const y1 = Math.min(stage.rowY[3] - INSET, yOf(endMm) - (onRow(endMm) ? INSET : 0));
  return { y: r1(y0), h: r1(Math.max(y1 - y0, 1)) };
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
  /** The corners the pouch can take: across in its slab, front ↔ back in its reach (`PieceSettle.reachFrom` … `reachTo`). */
  range: NudgeRange;
  /** Placed by hand (a fine offset either way): the soft settle holds it where it was put. */
  nudged: boolean;
} & PieceRect;

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
  // Where each pouch stands front ↔ back: the fit's settle (the cut draws the same), or this Size's own.
  const settle = ctx.fit?.settle ?? settlePillow(placements, { size: stage.size, dims: ctx.dims });
  const settleOf = new Map<string, PieceSettle>(settle.pieces.map((s) => [s.key, s]));
  const cellLen = settle.cellLengthMm;
  const out: PieceLayout[] = [];
  for (const section of SECTIONS) {
    for (const subSection of SUB_SECTIONS) {
      const pieces = placements
        .filter((p) => p.section === section && p.subSection === subSection)
        .sort((a, b) => a.slot - b.slot);
      if (pieces.length === 0) continue;
      const frame = cellFrame(section, subSection, stage);
      const col = SUB_SECTIONS.indexOf(subSection);
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
                (p) => (settle.active ? settleOf.get(`${section}/${subSection}/${p.slot}`)?.settledThicknessMm : undefined) ?? dimsOf(p.itemId).thicknessMm,
              ),
            ) * (cellFit?.thicknessRatios[d] ?? 1),
        ),
        stage.k,
      );
      // Emit deepest-first so the renderer paints the top layer last (on top).
      for (let d = layers.length - 1; d >= 0; d--) {
        const roll = layers[d].length === 1 && ctx.dims?.get(layers[d][0].itemId)?.kind === "neck";
        const packed = packAcross(
          slabs[d],
          layers[d].map((p) => dimsOf(p.itemId)),
          stage.k,
          roll ? undefined : cellFit?.layers[d]?.pieces.map((p) => p.widthRatio),
          // Offsets are M millimetres too, so a pouch pushed to the edge stays at the edge at every Size.
          layers[d].map((p) => (p.offsetXMm ?? 0) * sizeF.across),
          roll ? [stage.colX[0], stage.colX[SECTIONS.length]] : undefined,
        );
        layers[d].forEach((piece, idx) => {
          const key = `${section}/${subSection}/${piece.slot}`;
          const s = settleOf.get(key);
          const { x, w, homeX, minX, maxX } = packed[idx];
          // True size (9-11-2026): its own length where the settle stands it — centred on its cell, or where it was
          // put — the same extent the cut draws. Never cut to its cell, never slumped past its length.
          const own = dimsOf(piece.itemId).lengthMm;
          const reachFrom = s ? SUB_SECTIONS.indexOf(s.reachFrom) : col;
          const reachTo = s ? SUB_SECTIONS.indexOf(s.reachTo) : col;
          const placed = s ?? extentAlong(col, cellLen, own, (piece.offsetYMm ?? 0) * sizeF.along, reachFrom, reachTo, settle.active);
          const home = extentAlong(col, cellLen, own, 0, reachFrom, reachTo, settle.active);
          const along = alongRect(stage, cellLen, placed.startMm, placed.endMm);
          // How far front ↔ back it can go: its centre within the columns it may reach.
          const lowest = extentAlong(col, cellLen, own, -Infinity, reachFrom, reachTo, settle.active);
          const highest = extentAlong(col, cellLen, own, Infinity, reachFrom, reachTo, settle.active);
          const rect = { x, y: along.y, w, h: along.h };
          out.push({
            key,
            section,
            subSection,
            slot: piece.slot,
            itemId: piece.itemId,
            depth: d,
            ...rect,
            settled: rect,
            home: { x: homeX, y: alongRect(stage, cellLen, home.startMm, home.endMm).y },
            range: {
              minX,
              maxX,
              minY: alongRect(stage, cellLen, lowest.startMm, lowest.endMm).y,
              maxY: alongRect(stage, cellLen, highest.startMm, highest.endMm).y,
            },
            nudged: Boolean(piece.offsetXMm || piece.offsetYMm),
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
  // The width axis runs along the capsule.
  const drawn = pieces.map((p) => {
    const d = dimsOf(p.itemId);
    return { ...d, widthMm: fitOf.get(p.slot)?.settledWidthMm ?? d.widthMm };
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
