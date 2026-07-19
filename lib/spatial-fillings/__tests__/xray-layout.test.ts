import { describe, expect, it } from "vitest";

import type { PillowPlacement } from "../core";
import { cellFrame, layoutPlacements, XRAY_VIEW } from "../xray-layout";

const piece = (slot: number, itemId = 1): PillowPlacement => ({
  section: "center",
  subSection: "middle",
  slot,
  itemId,
});

describe("xray layout (ADR 0009 guardrail 3: deterministic)", () => {
  it("same placements always produce an identical layout, regardless of input order", () => {
    const placements: PillowPlacement[] = [
      { section: "left", subSection: "front", slot: 2, itemId: 7 },
      { section: "left", subSection: "front", slot: 1, itemId: 3 },
      { section: "right", subSection: "back", slot: 1, itemId: 7 },
    ];
    const a = layoutPlacements(placements);
    const b = layoutPlacements([...placements].reverse());
    expect(a).toEqual(b);
    expect(layoutPlacements(placements)).toEqual(a);
  });

  it.each([1, 2, 3, 4, 5])("%i pieces in one cell get distinct positions inside the cell", (n) => {
    const layout = layoutPlacements(Array.from({ length: n }, (_, i) => piece(i + 1)));
    expect(layout).toHaveLength(n);
    const positions = new Set(layout.map((p) => `${p.cx},${p.cy}`));
    expect(positions.size).toBe(n);
    const frame = cellFrame("center", "middle");
    for (const p of layout) {
      expect(p.cx).toBeGreaterThanOrEqual(frame.x);
      expect(p.cx).toBeLessThanOrEqual(frame.x + frame.w);
      expect(p.cy).toBeGreaterThanOrEqual(frame.y);
      expect(p.cy).toBeLessThanOrEqual(frame.y + frame.h);
    }
  });

  it("pieces compress as the cell fills: size never grows with count", () => {
    let prev = Infinity;
    for (let n = 1; n <= 5; n++) {
      const layout = layoutPlacements(Array.from({ length: n }, (_, i) => piece(i + 1)));
      const size = Math.max(...layout.map((p) => p.size));
      expect(size).toBeLessThanOrEqual(prev);
      expect(size).toBeGreaterThan(0);
      prev = size;
    }
  });

  it("every cell frame sits inside the view box and cells do not overlap", () => {
    const frames = (["left", "center", "right"] as const).flatMap((section) =>
      (["front", "middle", "back"] as const).map((subSection) => cellFrame(section, subSection)),
    );
    for (const f of frames) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(XRAY_VIEW.width);
      expect(f.y + f.h).toBeLessThanOrEqual(XRAY_VIEW.height);
    }
    for (let i = 0; i < frames.length; i++) {
      for (let j = i + 1; j < frames.length; j++) {
        const a = frames[i];
        const b = frames[j];
        const overlaps =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlaps).toBe(false);
      }
    }
  });

  it("keys carry cell + slot so renders are stable across edits", () => {
    const layout = layoutPlacements([piece(3, 9)]);
    expect(layout[0].key).toBe("center/middle/3");
    expect(layout[0].itemId).toBe(9);
  });
});
