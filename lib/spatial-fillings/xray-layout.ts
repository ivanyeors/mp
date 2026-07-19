/**
 * X-ray layout engine (ADR 0009 guardrail 3): deterministic slot layout for
 * 1–5 pieces per cell. Same placements → identical positions, always — Staff
 * compare the x-ray against the physical build. Pure, no I/O.
 */

import {
  SECTIONS,
  SUB_SECTIONS,
  type BolsterPlacement,
  type PillowPlacement,
  type Section,
  type SubSection,
} from "./core";

export const XRAY_VIEW = { width: 664, height: 374 } as const;

/** Nominal 3×3 grid boundaries (columns = Sections, rows = sub-sections). */
export const COL_X = [0, 221.3, 442.7, 664] as const;
export const ROW_Y = [0, 124.7, 249.3, 374] as const;

/**
 * Hair of padding between the shell and the fillings: pouches run to the
 * compartment walls and the silhouette/cell clips mold them to the shape.
 */
const INSET = 1;
/** Seam between pressed pouches, in view units. */
const GAP = 1;

export type CellFrame = { x: number; y: number; w: number; h: number };

export function cellFrame(section: Section, subSection: SubSection): CellFrame {
  const a = SECTIONS.indexOf(section);
  const b = SUB_SECTIONS.indexOf(subSection);
  return {
    x: COL_X[a] + INSET,
    y: ROW_Y[b] + INSET,
    w: COL_X[a + 1] - COL_X[a] - 2 * INSET,
    h: ROW_Y[b + 1] - ROW_Y[b] - 2 * INSET,
  };
}

/** Piece rect in view coordinates (shape assets are normalized to 100×100). */
export type PieceRect = { x: number; y: number; w: number; h: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Pack pieces into a frame like pouches stuffed into a compartment: the space
 * is partitioned into 1–2 rows of tracts (widths weighted by each piece's item
 * scale), so pouches press flat against their neighbors across a thin seam and
 * a bigger pouch shoves the row over. Outlines stay distinct (guardrail 2).
 * ponytail: space partition stands in for collision physics — deterministic,
 * no solver; revisit only if art direction demands organic jostling.
 */
function packPieces(frame: CellFrame, weights: number[], maxRows = 2): PieceRect[] {
  const n = weights.length;
  const fit = (r: number) => Math.min(frame.h / r, frame.w / Math.ceil(n / r));
  const rows = maxRows > 1 && n > 1 && fit(2) > fit(1) ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const rowH = frame.h / rows;
  const out: PieceRect[] = [];
  for (let row = 0; row < rows; row++) {
    const rowWeights = weights.slice(row * perRow, (row + 1) * perRow);
    const total = rowWeights.reduce((a, b) => a + b, 0);
    let x = frame.x;
    for (const weight of rowWeights) {
      const tract = (frame.w * weight) / total;
      // Pieces always fill their tract — stuffed pouches conform to the
      // compartment (the shell clip rounds off whatever meets the curve).
      out.push({
        x: r1(x + GAP / 2),
        y: r1(frame.y + row * rowH + GAP / 2),
        w: r1(tract - GAP),
        h: r1(rowH - GAP),
      });
      x += tract;
    }
  }
  return out;
}

export type PieceLayout = {
  key: string;
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
} & PieceRect;

/**
 * Deterministic layout: fixed cell order, pieces sorted by slot within a cell,
 * packed edge-to-edge. `itemScales` (item id → scale from the Item's size)
 * widens/narrows a piece's tract; absent ids weigh 1.
 */
export function layoutPlacements(
  placements: PillowPlacement[],
  itemScales?: ReadonlyMap<number, number>,
): PieceLayout[] {
  const out: PieceLayout[] = [];
  for (const section of SECTIONS) {
    for (const subSection of SUB_SECTIONS) {
      const pieces = placements
        .filter((p) => p.section === section && p.subSection === subSection)
        .sort((a, b) => a.slot - b.slot);
      if (pieces.length === 0) continue;
      const rects = packPieces(
        cellFrame(section, subSection),
        pieces.map((p) => itemScales?.get(p.itemId) ?? 1),
      );
      pieces.forEach((piece, idx) => {
        out.push({
          key: `${section}/${subSection}/${piece.slot}`,
          section,
          subSection,
          slot: piece.slot,
          itemId: piece.itemId,
          ...rects[idx],
        });
      });
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
 * (guardrail 2).
 */
export function layoutBolsterPlacements(
  placements: BolsterPlacement[],
  length: BolsterLength,
  itemScales?: ReadonlyMap<number, number>,
): BolsterPieceLayout[] {
  const pieces = [...placements].sort((a, b) => a.slot - b.slot);
  if (pieces.length === 0) return [];
  const rects = packPieces(
    bolsterFrame(length),
    pieces.map((p) => itemScales?.get(p.itemId) ?? 1),
    1,
  );
  return pieces.map((piece, idx) => ({
    key: `compartment/${piece.slot}`,
    slot: piece.slot,
    itemId: piece.itemId,
    ...rects[idx],
  }));
}
