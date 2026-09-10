/**
 * Cell-list view of a pillow recipe: per-cell ordered item ids, keyed
 * "section/subSection". Pure + browser-safe.
 *
 * These were the pure half of the retired 3×3 PillowCellGrid component, kept
 * because surfaces that only *summarise* a recipe (order detail) still want a
 * stable cell order without mounting the X-ray editor.
 */

import { SECTIONS, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "./core";

/** Stable cell order: sub-section rows (front→back) × Section columns (left→right). */
export const CELLS: Array<{ section: Section; subSection: SubSection }> = SUB_SECTIONS.flatMap(
  (subSection) => SECTIONS.map((section) => ({ section, subSection })),
);

const cellKey = (section: Section, subSection: SubSection) => `${section}/${subSection}`;

/** Grid state: ordered item ids per cell keyed "section/subSection" (slot = index + 1). */
export type CellMap = Map<string, number[]>;

/** Placements → per-cell ordered item lists (slot order preserved). */
export function placementsToCells(value: PillowPlacement[]): CellMap {
  const cells: CellMap = new Map();
  for (const p of [...value].sort((a, b) => a.slot - b.slot)) {
    const key = cellKey(p.section, p.subSection);
    cells.set(key, [...(cells.get(key) ?? []), p.itemId]);
  }
  return cells;
}

/**
 * Per-cell item lists → placements; slot numbers are the 1-based position in
 * each cell's list. The CellMap view has no layer axis, so this builds a
 * SINGLE-layer cell (no `row`) and is capped by MAX_PIECES_PER_LAYER, not by the
 * per-cell piece cap. Summarising surfaces flatten layers away on the way in.
 */
export function cellsToPlacements(cells: CellMap): PillowPlacement[] {
  const out: PillowPlacement[] = [];
  for (const { section, subSection } of CELLS) {
    (cells.get(cellKey(section, subSection)) ?? []).forEach((itemId, i) => {
      out.push({ section, subSection, slot: i + 1, itemId });
    });
  }
  return out;
}
