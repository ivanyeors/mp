/**
 * X-ray layout engine (ADR 0009 guardrail 3): deterministic slot layout for
 * 1–5 pieces per cell. Same placements → identical positions, always — Staff
 * compare the x-ray against the physical build. Pure, no I/O.
 *
 * Slice 02 (ADR 0019): a piece's rect is its registry footprint, `mm × k` for
 * the pillow Size, packed left→right in slot order and centred in its cell —
 * never a share of the cell split by weight. A layer wider than its cell is
 * clamped pro rata for now; slice 03 turns that into compression with a
 * status. Depth is the layer's real thickness, foreshortened.
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
import { GENERIC_POUCH, type PouchDimensions, type ResolvedDims } from "./dimensions";
import type { CellFit, PillowFit } from "./fit";
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
 * Pack pieces into a frame by weight: the frame width is split in proportion,
 * so pouches press flat against their neighbours across a thin seam and a
 * bigger pouch shoves the row over. Kept for the Mbolster (slice 09 gives it
 * dimensions); the pillow packs true-scale below.
 */
function packByWeight(frame: CellFrame, weights: number[]): PieceRect[] {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = frame.x;
  const out: PieceRect[] = [];
  for (const weight of weights) {
    const tract = (frame.w * weight) / total;
    out.push({ x: r1(x + GAP / 2), y: r1(frame.y + GAP / 2), w: r1(tract - GAP), h: r1(frame.h - GAP) });
    x += tract;
  }
  return out;
}

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
 * True-scale pack of one layer: rects at `mm × k`, left→right in slot order,
 * the group centred in the slab; length clamped to the slab (a longer pouch
 * spans it, no error). With a fit (slice 03) each width is its relaxed width
 * × `widthRatio`, so a squeezed layer draws squeezed; a group still wider than
 * the slab (an `over` layer) is clamped pro rata so nothing overflows.
 */
function packTrueScale(slab: CellFrame, pieces: PouchDimensions[], k: number, widthRatios?: readonly number[]): PieceRect[] {
  const seams = GAP * (pieces.length - 1);
  const feet = pieces.map((d, i) => {
    const f = footprint(d, k);
    return { w: f.w * (widthRatios?.[i] ?? 1), h: f.h };
  });
  const totalW = feet.reduce((sum, f) => sum + f.w, 0);
  const avail = Math.max(slab.w - seams, 1);
  const scale = totalW > avail ? avail / totalW : 1;
  let x = slab.x + (slab.w - (totalW * scale + seams)) / 2;
  return feet.map((f) => {
    const w = f.w * scale;
    const h = Math.min(f.h, slab.h);
    const rect = { x: r1(x), y: r1(slab.y + (slab.h - h) / 2), w: r1(w), h: r1(h) };
    x += w + GAP;
    return rect;
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
 * each drawn at its registry footprint for the Size (`ctx.stage.k`).
 */
export function layoutPlacements(placements: PillowPlacement[], ctx: LayoutContext = {}): PieceLayout[] {
  const stage = ctx.stage ?? M_STAGE();
  const dimsOf = (itemId: number): PouchDimensions => ctx.dims?.get(itemId)?.dims ?? GENERIC_POUCH;
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
      const slabs = depthSlabs(
        frame,
        layers.map(
          (list, d) =>
            Math.max(...list.map((p) => dimsOf(p.itemId).thicknessMm)) * (cellFit?.thicknessRatios[d] ?? 1),
        ),
        stage.k,
      );
      // Emit deepest-first so the renderer paints the top layer last (on top).
      for (let d = layers.length - 1; d >= 0; d--) {
        const rects = packTrueScale(
          slabs[d],
          layers[d].map((p) => dimsOf(p.itemId)),
          stage.k,
          cellFit?.layers[d]?.pieces.map((p) => p.widthRatio),
        );
        layers[d].forEach((piece, idx) => {
          out.push({
            key: `${section}/${subSection}/${piece.slot}`,
            section,
            subSection,
            slot: piece.slot,
            itemId: piece.itemId,
            depth: d,
            ...rects[idx],
          });
        });
      }
    }
  }
  return out;
}

// --- Mbolster: single long compartment (ADR 0008 amendment, slice 13) --------

export type BolsterLength = "short" | "medium" | "long";

/** Capsule total length per Mbolster length, in the shared 664×374 view. */
export const BOLSTER_CAPSULE_LENGTHS: Record<BolsterLength, number> = {
  short: 460,
  medium: 560,
  long: 640,
};

export const BOLSTER_CAPSULE_HEIGHT = 180;

/**
 * Inner content frame of the capsule — full bleed into the rounded ends: the
 * capsule clip molds the end pouches to the curve (conform, no dead margin).
 */
export function bolsterFrame(length: BolsterLength): CellFrame {
  const len = BOLSTER_CAPSULE_LENGTHS[length];
  const x0 = (XRAY_VIEW.width - len) / 2;
  const y0 = (XRAY_VIEW.height - BOLSTER_CAPSULE_HEIGHT) / 2;
  return {
    x: x0 + INSET,
    y: y0 + INSET,
    w: len - 2 * INSET,
    h: BOLSTER_CAPSULE_HEIGHT - 2 * INSET,
  };
}

export type BolsterPieceLayout = {
  key: string;
  slot: number;
  itemId: number;
} & PieceRect;

/**
 * Deterministic bolster layout: pieces sorted by slot, packed edge-to-edge in
 * a SINGLE line along the capsule — the physical bolster can't stack a second
 * layer. No cap — tracts shrink as pieces are added, outlines stay distinct
 * (guardrail 2). `itemWeights` (item id → relative width, the registry's
 * widthMm) widens/narrows a piece's tract; absent ids weigh 1. Slice 09 gives
 * the bolster true dimensions.
 */
export function layoutBolsterPlacements(
  placements: BolsterPlacement[],
  length: BolsterLength,
  itemWeights?: ReadonlyMap<number, number>,
): BolsterPieceLayout[] {
  const pieces = [...placements].sort((a, b) => a.slot - b.slot);
  if (pieces.length === 0) return [];
  const rects = packByWeight(
    bolsterFrame(length),
    pieces.map((p) => itemWeights?.get(p.itemId) ?? 1),
  );
  return pieces.map((piece, idx) => ({
    key: `compartment/${piece.slot}`,
    slot: piece.slot,
    itemId: piece.itemId,
    ...rects[idx],
  }));
}
