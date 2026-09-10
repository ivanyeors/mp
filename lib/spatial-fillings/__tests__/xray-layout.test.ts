import { describe, expect, it } from "vitest";

import type { BolsterPlacement, PillowPlacement } from "../core";
import {
  bolsterFrame,
  cellFrame,
  layoutBolsterPlacements,
  layoutPlacements,
  XRAY_VIEW,
  type PieceRect,
} from "../xray-layout";

const piece = (slot: number, itemId = 1): PillowPlacement => ({
  section: "center",
  subSection: "middle",
  slot,
  itemId,
});

const inFrame = (p: PieceRect, f: PieceRect) => {
  expect(p.x).toBeGreaterThanOrEqual(f.x);
  expect(p.y).toBeGreaterThanOrEqual(f.y);
  expect(p.x + p.w).toBeLessThanOrEqual(f.x + f.w + 0.1);
  expect(p.y + p.h).toBeLessThanOrEqual(f.y + f.h + 0.1);
  expect(p.w).toBeGreaterThan(0);
  expect(p.h).toBeGreaterThan(0);
};

const disjoint = (rects: PieceRect[]) => {
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlaps, `piece ${i} overlaps piece ${j}`).toBe(false);
    }
  }
};

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

  it.each([1, 2, 3, 4, 5])("%i pieces pack inside the cell without overlapping", (n) => {
    const layout = layoutPlacements(Array.from({ length: n }, (_, i) => piece(i + 1)));
    expect(layout).toHaveLength(n);
    disjoint(layout);
    const frame = cellFrame("center", "middle");
    for (const p of layout) inFrame(p, frame);
  });

  it("pieces compress as the cell fills: area never grows with count", () => {
    let prev = Infinity;
    for (let n = 1; n <= 5; n++) {
      const layout = layoutPlacements(Array.from({ length: n }, (_, i) => piece(i + 1)));
      const area = Math.max(...layout.map((p) => p.w * p.h));
      expect(area).toBeLessThanOrEqual(prev + 0.1);
      expect(area).toBeGreaterThan(0);
      prev = area;
    }
  });

  it("adjacent pieces press against each other across a thin seam", () => {
    const layout = layoutPlacements([piece(1), piece(2)]);
    const [a, b] = [...layout].sort((p, q) => p.x - q.x);
    expect(b.x - (a.x + a.w)).toBeLessThanOrEqual(1.5); // GAP seam, not a float
  });

  it("every cell frame sits inside the view box and cells do not overlap", () => {
    const frames = (["left", "center", "right"] as const).flatMap((section) =>
      (["front", "middle", "back"] as const).map((subSection) => cellFrame(section, subSection)),
    );
    for (const f of frames) inFrame(f, { x: 0, y: 0, w: XRAY_VIEW.width, h: XRAY_VIEW.height });
    disjoint(frames);
  });

  it("keys carry cell + slot so renders are stable across edits", () => {
    const layout = layoutPlacements([piece(3, 9)]);
    expect(layout[0].key).toBe("center/middle/3");
    expect(layout[0].itemId).toBe(9);
  });

  it("a larger item shoves the row: wider tract than its sibling", () => {
    const layout = layoutPlacements([piece(1, 8), piece(2, 9)], new Map([[9, 1.3]]));
    const small = layout.find((p) => p.itemId === 8)!;
    const large = layout.find((p) => p.itemId === 9)!;
    expect(large.w).toBeGreaterThan(small.w);
  });

  it("explicit depth stacks as a back-to-front overlay (deeper shifts down-right)", () => {
    const layout = layoutPlacements([
      { ...piece(1), row: 0 },
      { ...piece(2), row: 1 },
      { ...piece(3), row: 2 },
    ]);
    const byDepth = new Map(layout.map((p) => [p.depth, p]));
    const top = byDepth.get(0)!;
    const deep = byDepth.get(2)!;
    const frame = cellFrame("center", "middle");
    expect(top.w).toBeGreaterThan(frame.w * 0.6); // near-full-cell layers, not split rows
    expect(deep.y).toBeGreaterThan(top.y); // deeper = further down
    expect(deep.x).toBeGreaterThan(top.x); // + a hair right
    expect(layout[0].depth).toBe(2); // emitted deepest-first…
    expect(layout[layout.length - 1].depth).toBe(0); // …so the top layer paints last
  });

  it("side-by-side (no explicit row) is unchanged and reports depth 0", () => {
    const withUndef = layoutPlacements([
      { ...piece(1), row: undefined },
      { ...piece(2), row: undefined },
    ]);
    expect(withUndef).toEqual(layoutPlacements([piece(1), piece(2)]));
    expect(withUndef.every((p) => p.depth === 0)).toBe(true);
  });

  it("pieces sharing a layer split that layer's slab, not the whole cell", () => {
    const layout = layoutPlacements([
      { ...piece(1), row: 0 },
      { ...piece(2), row: 0 },
      { ...piece(3), row: 1 },
    ]);
    const top = layout.filter((p) => p.depth === 0);
    const deep = layout.filter((p) => p.depth === 1);
    expect(top).toHaveLength(2);
    expect(deep).toHaveLength(1);
    // The two top pieces sit side by side: same band, different columns.
    expect(top[0].y).toBeCloseTo(top[1].y, 5);
    expect(top[0].x).not.toBeCloseTo(top[1].x, 1);
    // …and together they span what the single deeper piece spans alone.
    expect(top[0].w + top[1].w).toBeGreaterThan(deep[0].w * 0.9);
    expect(deep[0].y).toBeGreaterThan(top[0].y); // the layer itself is still deeper
  });

  it("a layer emptied out of the middle does not render as a gap", () => {
    // Stored rows can carry a hole (layer 1 deleted); layers compact on layout,
    // so two surviving layers overlay as 0/1 — never 0 and a two-step-deep 2.
    const holed = layoutPlacements([
      { ...piece(1), row: 0 },
      { ...piece(2), row: 2 },
    ]);
    const dense = layoutPlacements([
      { ...piece(1), row: 0 },
      { ...piece(2), row: 1 },
    ]);
    expect(holed).toEqual(dense);
  });

  it("row: undefined and row: 0 are the same layer", () => {
    const mixed = layoutPlacements([{ ...piece(1), row: undefined }, { ...piece(2), row: 0 }]);
    expect(mixed.every((p) => p.depth === 0)).toBe(true);
    expect(mixed).toEqual(layoutPlacements([piece(1), piece(2)]));
  });
});

const bolsterPiece = (slot: number, itemId = 1): BolsterPlacement => ({ slot, itemId });

describe("bolster layout (single compartment, no cap)", () => {
  it("same placements always produce an identical layout, regardless of input order", () => {
    const placements = [bolsterPiece(2, 7), bolsterPiece(1, 3), bolsterPiece(3, 7)];
    const a = layoutBolsterPlacements(placements, "medium");
    expect(layoutBolsterPlacements([...placements].reverse(), "medium")).toEqual(a);
  });

  it.each([1, 4, 5, 9])("%i pieces pack inside the compartment without overlapping", (n) => {
    const placements = Array.from({ length: n }, (_, i) => bolsterPiece(i + 1));
    const layout = layoutBolsterPlacements(placements, "long");
    expect(layout).toHaveLength(n);
    disjoint(layout);
    const frame = bolsterFrame("long");
    for (const p of layout) inFrame(p, frame);
  });

  it("pieces always stack in a single line — no second layer", () => {
    for (const n of [2, 5, 12]) {
      const layout = layoutBolsterPlacements(
        Array.from({ length: n }, (_, i) => bolsterPiece(i + 1)),
        "short",
      );
      expect(new Set(layout.map((p) => p.y)).size).toBe(1);
    }
  });

  it("pieces compress as the compartment fills: area never grows with count", () => {
    let prev = Infinity;
    for (const n of [1, 2, 4, 6, 10]) {
      const layout = layoutBolsterPlacements(
        Array.from({ length: n }, (_, i) => bolsterPiece(i + 1)),
        "short",
      );
      const area = Math.max(...layout.map((p) => p.w * p.h));
      expect(area).toBeLessThanOrEqual(prev + 0.1);
      prev = area;
    }
  });

  it("a longer bolster has a wider compartment frame inside the view", () => {
    const short = bolsterFrame("short");
    const long = bolsterFrame("long");
    expect(long.w).toBeGreaterThan(short.w);
    inFrame(long, { x: 0, y: 0, w: XRAY_VIEW.width, h: XRAY_VIEW.height });
  });

  it("keys carry the slot so renders are stable across edits", () => {
    const layout = layoutBolsterPlacements([bolsterPiece(4, 9)], "medium");
    expect(layout[0].key).toBe("compartment/4");
    expect(layout[0].itemId).toBe(9);
  });
});
