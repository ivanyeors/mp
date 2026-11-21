import { describe, it, expect } from "vitest";
import { MIDVIEW_08_83 } from "@/lib/showroom/midview-08-83";
import { bounds, fitDistance, legendSwatches, partFacts, partLabel } from "@/lib/showroom/describe";

const unit = MIDVIEW_08_83;
const items = new Set(unit.model.parts.map((p) => p.item));

describe("Midview #08-83 model", () => {
  it("is a well-formed triangle list for every part and zone piece", () => {
    for (const p of [...unit.model.parts, ...unit.model.zonePieces]) {
      expect(p.position.length % 3).toBe(0);
      expect(p.index.length % 3).toBe(0);
      expect(Math.max(...p.index)).toBeLessThan(p.position.length / 3);
    }
  });

  it("gives every zone piece a zone the unit names", () => {
    expect(unit.zoneNames).toHaveLength(unit.model.zones.length);
    for (const p of unit.model.zonePieces) {
      expect(p.zone).toBeLessThan(unit.model.zones.length);
    }
  });

  it("names only items that exist, and names every item", () => {
    for (const key of Object.keys(unit.partNames)) expect(items).toContain(key);
    for (const key of Object.keys(unit.pieceNames)) expect(items).toContain(key.split(":")[0]);
    for (const key of Object.keys(unit.partNotes)) expect(items).toContain(key);
    for (const p of unit.model.parts) expect(partLabel(unit, p)).not.toBe(p.item);
  });

  it("finds a colour for every key entry", () => {
    expect(legendSwatches(unit)).toHaveLength(unit.legend.length);
  });

  it("marks the GD2 panes and the transom as glass", () => {
    const glass = unit.model.parts.filter((p) => p.glass).map((p) => p.name).sort();
    expect(glass).toEqual(["gd2_glass0", "gd2_transom", "wc_east_glass0"]);
  });
});

describe("part descriptions", () => {
  it("prefers a wall piece's own name over its wall's", () => {
    expect(partLabel(unit, { item: "gd2", role: "glass" })).toBe("GD2 glazing");
    expect(partLabel(unit, { item: "gd2", role: "door" })).toBe("GD2 window wall");
    expect(partLabel(unit, { item: "unknown", role: "box" })).toBe("unknown");
  });

  it("states plan size, heights and position in metres", () => {
    const b = bounds([13.161, 0.95, 2.018, 13.239, 3, 5.864]);
    expect(partFacts(b)).toEqual([
      "0.08 × 3.85 m in plan",
      "0.95 → 3.00 m above floor",
      "x 13.16–13.24 · z 2.02–5.86",
    ]);
  });
});

describe("fitDistance", () => {
  const t = Math.tan((40 * Math.PI) / 360);

  it("is height-bound on a wide screen", () => {
    expect(fitDistance(10, 8, 40, 2)).toBeCloseTo(8 / t);
  });

  it("is width-bound on a narrow screen", () => {
    expect(fitDistance(10, 8, 40, 0.5)).toBeCloseTo(10 / (t * 0.5));
  });
});
