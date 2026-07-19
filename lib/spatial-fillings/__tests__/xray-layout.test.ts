import { describe, expect, it } from "vitest";

import type { BolsterPlacement, PillowPlacement } from "../core";
import {
  BOLSTER_FRAME,
  cellFrame,
  layoutBolsterPlacements,
  layoutPlacements,
  XRAY_VIEW,
} from "../xray-layout";

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

describe("bolster xray layout (slice 13: single compartment, n unbounded)", () => {
  const mix = (n: number): BolsterPlacement[] =>
    Array.from({ length: n }, (_, i) => ({ slot: i + 1, itemId: 1 }));

  it("same placements always produce an identical layout, regardless of input order", () => {
    const placements = mix(7);
    const a = layoutBolsterPlacements(placements);
    const b = layoutBolsterPlacements([...placements].reverse());
    expect(a).toEqual(b);
    expect(layoutBolsterPlacements(placements)).toEqual(a);
  });

  it.each([1, 2, 5, 12, 40])("%i pieces stay distinct inside the capsule frame", (n) => {
    const layout = layoutBolsterPlacements(mix(n));
    expect(layout).toHaveLength(n);
    const positions = new Set(layout.map((p) => `${p.cx},${p.cy}`));
    expect(positions.size).toBe(n);
    for (const p of layout) {
      expect(p.cx).toBeGreaterThanOrEqual(BOLSTER_FRAME.x);
      expect(p.cx).toBeLessThanOrEqual(BOLSTER_FRAME.x + BOLSTER_FRAME.w);
      expect(p.cy).toBeGreaterThanOrEqual(BOLSTER_FRAME.y);
      expect(p.cy).toBeLessThanOrEqual(BOLSTER_FRAME.y + BOLSTER_FRAME.h);
    }
  });

  it("rows fill left-to-right by slot and pieces compress as count grows (no cap)", () => {
    const layout = layoutBolsterPlacements(mix(5));
    // First row is ordered left-to-right by slot.
    const firstRowY = layout[0].cy;
    const firstRow = layout.filter((p) => p.cy === firstRowY);
    expect(firstRow.map((p) => p.slot)).toEqual([...firstRow].sort((a, b) => a.cx - b.cx).map((p) => p.slot));
    // Size never grows with count.
    let prev = Infinity;
    for (const n of [1, 3, 8, 20, 60]) {
      const size = layoutBolsterPlacements(mix(n))[0].size;
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(prev);
      prev = size;
    }
  });

  it("keys carry the compartment + slot; empty mix renders nothing", () => {
    expect(layoutBolsterPlacements([{ slot: 4, itemId: 9 }])[0].key).toBe("compartment/4");
    expect(layoutBolsterPlacements([])).toEqual([]);
  });
});
