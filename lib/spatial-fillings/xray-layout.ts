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

export const COL_X: readonly [number, number, number, number] = M_STAGE().colX;
export const ROW_Y: readonly [number, number, number, number] = M_STAGE().rowY;

const INSET = 1;
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

export type PieceRect = { x: number; y: number; w: number; h: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

const FORESHORTEN = 0.5;
const DEPTH_DX = 0.5;
const MAX_STACK_DROP = 0.5;

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

function footprint(dims: PouchDimensions, k: number): { w: number; h: number } {
  return { w: dims.widthMm * k, h: dims.lengthMm * k };
}

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

type AcrossPack = { x: number; w: number; homeX: number; minX: number; maxX: number };

export type NudgeRange = { minX: number; maxX: number; minY: number; maxY: number };

function packAcross(
  slab: CellFrame,
  pieces: PouchDimensions[],
  k: number,
  widthRatios: readonly number[] | undefined,
  offsetsX: readonly number[],
): AcrossPack[] {
  const seams = GAP * (pieces.length - 1);
  const feet = pieces.map((d, i) => footprint(d, k).w * (widthRatios?.[i] ?? 1));
  const sum = feet.reduce((t, w) => t + w, 0);
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
    const x = Math.max(Math.min(Math.max(homeX + offsetsX[i] * k, minX), Math.max(minX, maxX)), prevRight + GAP);
    prevRight = x + w;
    return { x: r1(x), w: r1(w), homeX: r1(homeX), minX: r1(minX), maxX: r1(maxX) };
  });
}

function alongRect(stage: StageGeometry, cellMm: number, startMm: number, endMm: number): { y: number; h: number } {
  const yOf = (mm: number) => {
    const b = Math.min(Math.max(Math.floor(mm / cellMm), 0), SUB_SECTIONS.length - 1);
    for (const row of [b, b + 1]) if (Math.abs(mm - row * cellMm) < 0.15) return stage.rowY[row];
    return stage.rowY[b] + ((mm - b * cellMm) * (stage.rowY[b + 1] - stage.rowY[b])) / cellMm;
  };
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
  depth: number;
  level: number;
  settled: PieceRect;
  home: { x: number; y: number };
  range: NudgeRange;
  nudged: boolean;
  relaxedH: number;
} & PieceRect;

export type LayoutContext = {
  stage?: StageGeometry;
  dims?: ReadonlyMap<number, ResolvedDims>;
  fit?: PillowFit;
};

export function layoutPlacements(placements: PillowPlacement[], ctx: LayoutContext = {}): PieceLayout[] {
  const stage = ctx.stage ?? M_STAGE();
  const dimsOf = dimsAtSize(ctx.dims, PILLOW_DIMENSIONS[stage.size]);
  const sizeF = sizeFactors(PILLOW_DIMENSIONS[stage.size]);
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
      const layers = cellLayerGroups(pieces);
      const cellFit: CellFit | undefined = ctx.fit?.cells.find(
        (c) => c.section === section && c.subSection === subSection,
      );
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
      for (let d = layers.length - 1; d >= 0; d--) {
        const roll = layers[d].length === 1 && ctx.dims?.get(layers[d][0].itemId)?.kind === "neck";
        const packed = packAcross(
          slabs[d],
          layers[d].map((p) => dimsOf(p.itemId)),
          stage.k,
          roll ? undefined : cellFit?.layers[d]?.pieces.map((p) => p.widthRatio),
          layers[d].map((p) => (p.offsetXMm ?? 0) * sizeF.across),
        );
        layers[d].forEach((piece, idx) => {
          const key = `${section}/${subSection}/${piece.slot}`;
          const s = settleOf.get(key);
          const { x, w, homeX, minX, maxX } = packed[idx];
          const own = dimsOf(piece.itemId).lengthMm;
          const reachFrom = s ? SUB_SECTIONS.indexOf(s.reachFrom) : col;
          const reachTo = s ? SUB_SECTIONS.indexOf(s.reachTo) : col;
          const placed = s ?? extentAlong(col, cellLen, own, (piece.offsetYMm ?? 0) * sizeF.along, reachFrom, reachTo, settle.active);
          const home = extentAlong(col, cellLen, own, 0, reachFrom, reachTo, settle.active);
          const along = alongRect(stage, cellLen, placed.startMm, placed.endMm);
          const pressed = own / Math.max(placed.endMm - placed.startMm, 1);
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
            level: layers.length - 1 - d,
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
            relaxedH: pressed > 1 + 1e-3 ? r1(along.h * pressed) : along.h,
          });
        });
      }
    }
  }
  return out;
}

export type BolsterLength = "short" | "medium" | "long";

export const BOLSTER_CAPSULE_LENGTHS: Record<BolsterLength, number> = {
  short: 460,
  medium: 560,
  long: 640,
};

export const BOLSTER_CAPSULE_HEIGHT = 180;

export type BolsterStage = {
  length: BolsterLength;
  k: number;
  lengthView: number;
  heightView: number;
  x0: number;
  cy: number;
};

export function bolsterStage(length: BolsterLength, bolster: BolsterDimensions = BOLSTER_DIMENSIONS[length]): BolsterStage {
  const lengthView = BOLSTER_CAPSULE_LENGTHS[length];
  const k = lengthView / bolster.lengthMm;
  const heightView = Math.min(r1(bolster.diameterMm * k), XRAY_VIEW.height - 40);
  return { length, k, lengthView, heightView, x0: (XRAY_VIEW.width - lengthView) / 2, cy: XRAY_VIEW.height / 2 };
}

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

export type BolsterLayoutContext = {
  dims?: ReadonlyMap<number, ResolvedDims>;
  fit?: BolsterFit;
};

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
