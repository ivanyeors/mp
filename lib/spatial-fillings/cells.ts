import { SECTIONS, SUB_SECTIONS, type PillowPlacement, type Section, type SubSection } from "./core";

export const CELLS: Array<{ section: Section; subSection: SubSection }> = SUB_SECTIONS.flatMap(
  (subSection) => SECTIONS.map((section) => ({ section, subSection })),
);

const cellKey = (section: Section, subSection: SubSection) => `${section}/${subSection}`;

export type CellMap = Map<string, number[]>;

export function placementsToCells(value: PillowPlacement[]): CellMap {
  const cells: CellMap = new Map();
  for (const p of [...value].sort((a, b) => a.slot - b.slot)) {
    const key = cellKey(p.section, p.subSection);
    cells.set(key, [...(cells.get(key) ?? []), p.itemId]);
  }
  return cells;
}

export function cellsToPlacements(cells: CellMap): PillowPlacement[] {
  const out: PillowPlacement[] = [];
  for (const { section, subSection } of CELLS) {
    (cells.get(cellKey(section, subSection)) ?? []).forEach((itemId, i) => {
      out.push({ section, subSection, slot: i + 1, itemId });
    });
  }
  return out;
}
