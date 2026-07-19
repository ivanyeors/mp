/**
 * X-ray layout engine (ADR 0009 guardrail 3): deterministic slot layout for
 * 1–5 pieces per cell. Same placements → identical positions, always — Staff
 * compare the x-ray against the physical build. Pure, no I/O.
 */

import { SECTIONS, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "./core";

export const XRAY_VIEW = { width: 664, height: 374 } as const;

/** Nominal 3×3 grid boundaries (columns = Sections, rows = sub-sections). */
export const COL_X = [0, 221.3, 442.7, 664] as const;
export const ROW_Y = [0, 124.7, 249.3, 374] as const;

const INSET = 10;
const BASE_FRACTION = 0.9;

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

/**
 * Fixed arrangements per piece count (dice-like). Pieces compress — scale
 * down, sit closer — but never merge: each keeps its own outline (guardrail 2).
 */
const SLOT_LAYOUTS: Record<number, Array<{ x: number; y: number; scale: number }>> = {
  1: [{ x: 0.5, y: 0.5, scale: 1 }],
  2: [
    { x: 0.3, y: 0.5, scale: 0.8 },
    { x: 0.7, y: 0.5, scale: 0.8 },
  ],
  3: [
    { x: 0.5, y: 0.32, scale: 0.7 },
    { x: 0.3, y: 0.68, scale: 0.7 },
    { x: 0.7, y: 0.68, scale: 0.7 },
  ],
  4: [
    { x: 0.3, y: 0.3, scale: 0.62 },
    { x: 0.7, y: 0.3, scale: 0.62 },
    { x: 0.3, y: 0.7, scale: 0.62 },
    { x: 0.7, y: 0.7, scale: 0.62 },
  ],
  5: [
    { x: 0.28, y: 0.28, scale: 0.56 },
    { x: 0.72, y: 0.28, scale: 0.56 },
    { x: 0.5, y: 0.5, scale: 0.56 },
    { x: 0.28, y: 0.72, scale: 0.56 },
    { x: 0.72, y: 0.72, scale: 0.56 },
  ],
};

export type PieceLayout = {
  key: string;
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
  /** Piece center in view coordinates. */
  cx: number;
  cy: number;
  /** Rendered diameter (shape assets are normalized to a 100×100 box). */
  size: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Deterministic layout: fixed cell order, pieces sorted by slot within a cell. */
export function layoutPlacements(placements: PillowPlacement[]): PieceLayout[] {
  const out: PieceLayout[] = [];
  for (const section of SECTIONS) {
    for (const subSection of SUB_SECTIONS) {
      const pieces = placements
        .filter((p) => p.section === section && p.subSection === subSection)
        .sort((a, b) => a.slot - b.slot);
      if (pieces.length === 0) continue;
      const frame = cellFrame(section, subSection);
      const spots = SLOT_LAYOUTS[Math.min(pieces.length, 5)];
      pieces.forEach((piece, idx) => {
        const spot = spots[idx % spots.length];
        out.push({
          key: `${section}/${subSection}/${piece.slot}`,
          section,
          subSection,
          slot: piece.slot,
          itemId: piece.itemId,
          cx: r1(frame.x + frame.w * spot.x),
          cy: r1(frame.y + frame.h * spot.y),
          size: r1(Math.min(frame.w, frame.h) * BASE_FRACTION * spot.scale),
        });
      });
    }
  }
  return out;
}
