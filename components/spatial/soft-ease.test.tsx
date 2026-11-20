// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { conformPouchPath } from "@/lib/spatial-fillings/conform";
import { SUB_SECTIONS, type PillowPlacement, type SubSection } from "@/lib/spatial-fillings/core";
import { resolveDims, type ResolvedDims } from "@/lib/spatial-fillings/dimensions";
import { fitPillow } from "@/lib/spatial-fillings/fit";
import type { Pt } from "@/lib/spatial-fillings/soft-body";
import { SOFT_BODY_DEFAULTS } from "@/lib/spatial-fillings/soft-body-settings";
import { fillingVisual } from "@/lib/spatial-fillings/visuals";
import { layoutPlacements } from "@/lib/spatial-fillings/xray-layout";
import { stageGeometry, XRAY_VIEW } from "@/lib/spatial-fillings/xray-stage";
import { settleSoftCut, useSoftCut, type SoftCutInput, type SoftCutShapes } from "./soft-cut";
import { startRings, topPlanes, useSoftTopPaths, type SoftTopPlane } from "./soft-top";
import { softCutInputFor } from "./xray-cross-section";
import { stageRegions } from "./xray-pillow";

/**
 * The two easing hooks read the latest input, planes and `easeMs` when a new
 * settle starts, in the same commit that brought them: a held pouch's next
 * preview eases over the short `easeMs`, from where the last one was shown,
 * and a piece that is new eases in from where it was stacked.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The cut's test items (soft-cut.test.ts), each cell top → bottom.
const ITEMS: Record<number, { name: string; subtype: string }> = { 1: { name: "6D (S)", subtype: "6D" }, 2: { name: "6D Fold (S)", subtype: "6D" } };
const DIMS = new Map<number, ResolvedDims>(Object.entries(ITEMS).map(([id, it]) => [Number(id), resolveDims({ name: it.name, category: "filling" })]));
const SUBTYPES = new Map(Object.entries(ITEMS).map(([id, it]) => [Number(id), it.subtype] as const));
const SMALL = { front: [1], middle: [2], back: [1] };
const MORE = { front: [1], middle: [2], back: [1, 1] }; // one more pouch at the back: center/back/2

function placementsOf(cells: Partial<Record<SubSection, number[]>>): PillowPlacement[] {
  return SUB_SECTIONS.flatMap((subSection) => (cells[subSection] ?? []).map((itemId, row) => ({ section: "center" as const, subSection, slot: row + 1, itemId, row })));
}
const cutOf = (cells: Partial<Record<SubSection, number[]>>): SoftCutInput =>
  softCutInputFor(fitPillow(placementsOf(cells), { size: "M", dims: DIMS }), { section: "center" }, { compact: false, itemSubtypes: SUBTYPES });
function planesOf(cells: Partial<Record<SubSection, number[]>>): SoftTopPlane[] {
  const placements = placementsOf(cells);
  const stage = stageGeometry("M");
  const fit = fitPillow(placements, { size: "M", dims: DIMS });
  const regions = stageRegions(stage);
  const shapeOf = (itemId: number) => fillingVisual(SUBTYPES.get(itemId) ?? null).shape;
  const pieces = layoutPlacements(placements, { stage, dims: DIMS, fit });
  return topPlanes(
    stage,
    pieces.map((p) => ({ key: p.key, section: p.section, level: p.level, d: conformPouchPath(p.settled, [regions.sil, regions.sections[p.section]], shapeOf(p.itemId)), rect: p.settled, shape: shapeOf(p.itemId), relaxedH: p.relaxedH })),
    "settled",
  );
}

/** A path's points (its numbers, two at a time) and their middle. */
const points = (d: string): Pt[] => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]] as Pt);
};
const middle = (ring: readonly Pt[]): Pt => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];

// Frames and the clock, by hand.
let now = 0;
let frames: FrameRequestCallback[] = [];
const frame = (ms: number) =>
  act(() => {
    now += ms;
    const due = frames;
    frames = [];
    for (const cb of due) cb(now);
  });

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  now = 0;
  frames = [];
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  window.matchMedia = ((media: string) => ({ matches: false, media })) as unknown as typeof window.matchMedia;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useSoftCut", () => {
  let shown: SoftCutShapes | null = null;
  function Cut({ input, easeMs }: { input: SoftCutInput; easeMs?: number }) {
    shown = useSoftCut(input, true, 0, easeMs);
    return null;
  }

  it("eases a new settle over the easeMs that came with it, to the input that came with it", () => {
    const small = cutOf(SMALL);
    const more = cutOf(MORE);
    act(() => root.render(<Cut input={small} />));
    frame(10_000);
    expect(shown).toBe(settleSoftCut(small));

    act(() => root.render(<Cut input={more} easeMs={5} />));
    expect(shown).not.toBe(settleSoftCut(more)); // easing, from where `small` was shown
    frame(6); // past 5 ms: done. The settle's own length (≥ 200 ms) would still be easing.
    expect(shown).toBe(settleSoftCut(more));
  });
});

describe("useSoftTopPaths", () => {
  let paths: ReadonlyMap<string, string> | null = null;
  function Top({ planes, easeMs }: { planes: SoftTopPlane[]; easeMs?: number }) {
    paths = useSoftTopPaths(planes, SOFT_BODY_DEFAULTS, XRAY_VIEW, easeMs);
    return null;
  }

  it("eases a new piece in from where it was stacked, over the easeMs that came with it", () => {
    act(() => root.render(<Top planes={planesOf(MORE)} />));
    const settled = new Map(paths!); // first layout: shown as settled, no easing
    act(() => root.unmount());
    root = createRoot(host);

    act(() => root.render(<Top planes={planesOf(SMALL)} />));
    act(() => root.render(<Top planes={planesOf(MORE)} easeMs={5} />));
    // The new pouch starts from its stacked outline (seeded from the planes of this commit), not from where it settles.
    const stacked = planesOf(MORE)
      .map((plane) => startRings(plane).get("center/back/2"))
      .find(Boolean)!;
    const start = middle(points(paths!.get("center/back/2")!));
    const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    expect(dist(start, middle(stacked))).toBeLessThan(dist(start, middle(points(settled.get("center/back/2")!))));
    frame(6); // past 5 ms: done. The settle's own length (≥ 200 ms) would still be easing.
    expect(paths).toEqual(settled);
  });
});
