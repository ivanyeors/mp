import { describe, expect, it } from "vitest";

import { CELLS, cellsToPlacements, placementsToCells, type CellMap } from "../cells";
import {
  MAX_PIECES_PER_LAYER,
  derivePackList,
  flattenToPackList,
  pillowPlacementsToRows,
  rowsToPillowPlacements,
  validatePillowPlacements,
} from "@/lib/spatial-fillings/core";

const fullGrid: CellMap = new Map(
  CELLS.map(({ section, subSection }, i) => {
    const count = (i % MAX_PIECES_PER_LAYER) + 1;
    return [`${section}/${subSection}`, Array.from({ length: count }, (_, s) => (s % 2 === 0 ? 1 : 2))];
  }),
);

const categories = new Map([
  [1, "filling"],
  [2, "filling"],
]);

describe("pillow cell grid save→reload fidelity", () => {
  it("grid state → PUT rows → grid state is identity (slots = 1-based cell position)", () => {
    const placements = cellsToPlacements(fullGrid);
    expect(placements).toHaveLength(
      [...fullGrid.values()].reduce((sum, ids) => sum + ids.length, 0),
    );
    for (const p of placements) expect(p.slot).toBeGreaterThanOrEqual(1);

    const rows = pillowPlacementsToRows(placements);
    expect(validatePillowPlacements(rowsToPillowPlacements(rows), categories)).toEqual({ ok: true });

    const reloaded = [...rows].reverse();
    expect(placementsToCells(rowsToPillowPlacements(reloaded))).toEqual(fullGrid);
    expect(cellsToPlacements(placementsToCells(rowsToPillowPlacements(reloaded)))).toEqual(placements);
  });

  it("live BOM from grid state matches the server-side derivation", () => {
    const placements = cellsToPlacements(fullGrid);
    expect(flattenToPackList(placements)).toEqual(derivePackList(pillowPlacementsToRows(placements), []));
  });

  it("a sixth piece in one layer fails the shared validator (5-per-layer cap)", () => {
    const over = new Map(fullGrid);
    over.set("left/front", [1, 1, 1, 2, 2, 2]);
    const result = validatePillowPlacements(cellsToPlacements(over), categories);
    expect(result.ok).toBe(false);
  });
});
