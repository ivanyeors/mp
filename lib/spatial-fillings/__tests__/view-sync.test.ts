import { describe, expect, it } from "vitest";

import { placeAlongAt } from "@/lib/dnd/slab-drag";
import type { PillowPlacement, SubSection } from "../core";
import { alongSlabs } from "../cross-section";
import { GENERIC_POUCH, type PillowSize, type ResolvedDims } from "../dimensions";
import { fitPillow } from "../fit";
import { layoutPlacements } from "../xray-layout";
import { stageGeometry } from "../xray-stage";

const pouch = (lengthMm: number, thicknessMm: number, minThicknessMm: number): ResolvedDims => ({
  key: `test/${lengthMm}`,
  kind: "pouch",
  source: "fallback",
  measuredOn: null,
  dims: { ...GENERIC_POUCH, widthMm: 180, lengthMm, thicknessMm, minThicknessMm },
});
const DIMS = new Map<number, ResolvedDims>([
  [1, pouch(80, 45, 25)],
  [2, pouch(140, 45, 25)],
  [3, pouch(80, 45, 45)],
]);
const at = (subSection: SubSection, slot: number, itemId: number, row = 0, offsetYMm?: number): PillowPlacement => ({
  section: "center",
  subSection,
  slot,
  itemId,
  row,
  ...(offsetYMm === undefined ? {} : { offsetYMm }),
});

function bothViews(placements: PillowPlacement[], size: PillowSize = "M") {
  const fit = fitPillow(placements, { size, dims: DIMS });
  const stage = stageGeometry(size);
  const cut = new Map(alongSlabs(fit, "center").map((s) => [s.key, s] as const));
  return layoutPlacements(placements, { stage, dims: DIMS, fit }).map((p) => {
    const slab = cut.get(p.key)!;
    return {
      key: p.key,
      top: [(p.settled.y - stage.rowY[0]) / stage.k, (p.settled.y + p.settled.h - stage.rowY[0]) / stage.k],
      cut: [slab.startMm, slab.endMm],
    };
  });
}

function expectInSync(placements: PillowPlacement[], size: PillowSize = "M") {
  for (const v of bothViews(placements, size)) {
    expect(Math.abs(v.top[0] - v.cut[0]), `${v.key} front edge: top ${v.top[0]} / cut ${v.cut[0]}`).toBeLessThan(1.5);
    expect(Math.abs(v.top[1] - v.cut[1]), `${v.key} back edge: top ${v.top[1]} / cut ${v.cut[1]}`).toBeLessThan(1.5);
  }
}

describe("the top view and the cut draw every pouch in the same place", () => {
  it("whatever offset is stored, even one past the pouch's room", () => {
    for (const off of [-80, -40, -15, 0, 15, 40, 80]) {
      expectInSync([at("front", 1, 1), at("middle", 1, 1, 0, off)]);
      expectInSync([at("middle", 1, 3, 0, off), at("back", 1, 1)]);
      expectInSync([at("front", 1, 2), at("middle", 1, 2, 0, off)]);
      expectInSync([at("front", 1, 1), at("middle", 1, 1, 0, off)], "L");
    }
  });

  it("for a deeper Layer: depth no longer shifts a pouch along", () => {
    expectInSync([at("middle", 1, 2, 0), at("middle", 2, 2, 1)]);
    expectInSync([at("front", 1, 1, 0), at("middle", 1, 1, 0), at("middle", 2, 1, 1), at("back", 1, 1, 0)]);
  });

  it("after a move through the shared writer, from anywhere to anywhere", () => {
    const mix = [at("front", 1, 1), at("middle", 1, 1), at("middle", 2, 3, 1)];
    for (const ref of [{ section: "center", subSection: "middle", slot: 1 }, { section: "center", subSection: "middle", slot: 2 }] as const) {
      for (let mm = 0; mm <= 330; mm += 30) {
        const r = placeAlongAt(mix, ref, mm, { size: "M", dims: DIMS });
        expectInSync(r ? r.placements : mix);
      }
    }
  });
});
