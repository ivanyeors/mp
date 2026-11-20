import { describe, expect, it } from "vitest";

import { assembleBuild } from "@/lib/build-assembly";
import { placedChargeLines, priceComposedBuild, UNKEYED } from "@/lib/pricing/composed-price";
import { padRing, pouchPath, wellDip } from "@/components/spatial/slab-shape";
import { earWellCircle } from "@/components/spatial/xray-pillow";
import { pouchOutline } from "../conform";
import { placementKind, validateBolsterPlacements, validatePillowPlacements } from "../core";
import { pouchCatalog } from "../dimension-overrides";
import { CODE_REGISTRY, EAR_PAD_KEY, pouchKey, resolveDims } from "../dimensions";
import {
  fillingFamily,
  fillingItemsToSunburst,
  isEarPadItem,
  isInPillowAccessory,
  isNeckSupportItem,
  PLACEABLE_ITEMS_OR,
  pieceLabelLines,
} from "../filling-groups";
import { createSettle, signedArea, type Pt } from "../soft-body";
import { padWellOf, SOFT_BODY_DEFAULTS } from "../soft-body-settings";
import { fillingVisual } from "../visuals";

const EAR = { category: "accessories", name: "Ear Comfort Pad" };

describe("what an Ear Comfort Pad is", () => {
  it("is an in-pillow accessory, and not a neck support", () => {
    expect(isEarPadItem(EAR)).toBe(true);
    expect(isInPillowAccessory(EAR)).toBe(true);
    expect(isNeckSupportItem(EAR)).toBe(false);
    expect(isInPillowAccessory({ category: "accessories", name: "Cervical Neck Support" })).toBe(true);
    expect(isEarPadItem({ category: "filling", name: "Ear Comfort Pad" })).toBe(false);
    expect(isInPillowAccessory({ category: "accessories", name: "Slope Mattress" })).toBe(false);
  });

  it("is in the placeable Items the x-ray loads", () => {
    expect(PLACEABLE_ITEMS_OR).toContain("name.ilike.*ear comfort*");
  });

  it("is its own family, after the neck support, drawn as an ear pad", () => {
    expect(fillingFamily("Ear Comfort Pad")).toEqual({ key: "ear", label: "Ear pad" });
    expect(fillingVisual("Ear Comfort Pad")).toMatchObject({ shape: "ear", defaultColor: "#fda4af" });
    expect(fillingVisual("Cervical Neck Support").shape).toBe("pill");
    expect(fillingVisual("6D (S)").shape).toBe("pouch");
    expect(pieceLabelLines("Ear Comfort Pad", null)).toEqual(["Ear pad"]);
    const tree = fillingItemsToSunburst([
      { id: 41, name: "Ear Comfort Pad", subtype: null, size: null },
      { id: 61, name: "Cervical Neck Support", subtype: null, size: "S" },
      { id: 67, name: "6D", subtype: null, size: "S" },
    ]);
    expect(tree.map((n) => n.label)).toEqual(["6D", "Neck support", "Ear pad"]);
    expect(tree.at(-1)!.children).toEqual([{ id: "41", label: "Ear Comfort Pad" }]);
  });
});

describe("placing an Ear Comfort Pad", () => {
  const kinds = new Map([
    [41, placementKind(EAR)],
    [55, placementKind({ category: "filling", name: "6D" })],
  ]);
  const at = (itemId: number, slot: number) => ({ section: "center" as const, subSection: "middle" as const, slot, itemId });

  it("is placeable in a template and in a premium pillow", () => {
    expect(placementKind(EAR)).toBe("ear_pad");
    expect(validatePillowPlacements([at(55, 1), at(41, 2)], kinds)).toEqual({ ok: true });
    expect(validatePillowPlacements([at(55, 1), at(41, 2)], kinds, { tier: "premium" })).toEqual({ ok: true });
  });

  it("is premium pillows only: never basic, never a bolster", () => {
    expect(validatePillowPlacements([at(41, 1)], kinds, { tier: "basic" })).toEqual({
      ok: false,
      error: "An Ear Comfort Pad is for premium pillows only",
    });
    expect(validateBolsterPlacements([{ slot: 1, itemId: 41 }], kinds).ok).toBe(false);
  });

  it("adds its own MSRP per piece on top of the pillow's; fillings and a neck support add nothing", () => {
    const items = new Map([
      [55, { category: "filling", name: "6D" }],
      [61, { category: "accessories", name: "Cervical Neck Support" }],
      [41, EAR],
    ]);
    const msrps = new Map([
      [55, 12],
      [61, 38],
      [41, 60],
    ]);
    const lines = placedChargeLines(
      [
        { item_id: 55, count: 3 },
        { item_id: 61, count: 1 },
        { item_id: 41, count: 2 },
      ],
      items,
      msrps,
    );
    expect(lines).toEqual([{ msrp: 60, quantity: 2 }]);

    const base = {
      msrpByFamily: { [UNKEYED]: 360 },
      defaultCover: null,
      defaultCase: null,
      caseOptions: [],
      chosenCover: null,
      chosenCase: null,
    };
    const priced = priceComposedBuild({ ...base, addonLines: lines });
    expect(priced.ok && priced.subtotal).toBe(360 + 2 * 60);
    const unpriced = placedChargeLines([{ item_id: 41, count: 1 }], items, new Map());
    expect(priceComposedBuild({ ...base, addonLines: unpriced }).ok).toBe(false);
  });

  it("ships inside the pillow beside the fillings, out of stock and into its cost", () => {
    const costs = new Map([
      [55, 4],
      [41, 15],
    ]);
    const result = assembleBuild({
      composedBomLines: [],
      fillingTemplateLines: [
        { item_id: 55, quantity: 3, category: placementKind({ category: "filling", name: "6D" }) },
        { item_id: 41, quantity: 1, category: placementKind(EAR) },
      ],
      preferenceLines: [],
      addonLines: [],
      costByItem: costs,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines.filter((l) => l.role === "filling").map((l) => l.item_id)).toEqual([55, 41]);
    expect(result.cogs).toBe(3 * 4 + 15);
  });
});

describe("its dimensions", () => {
  it("keys as ear/one-size unsized, and by size when it has one", () => {
    expect(pouchKey({ name: "Ear Comfort Pad", size: null })).toBe(EAR_PAD_KEY);
    expect(pouchKey({ name: "Ear Comfort Pad", size: "-" })).toBe(EAR_PAD_KEY);
    expect(pouchKey({ name: "Ear Comfort Pad", size: "L" })).toBe("ear/l");
  });

  it("resolves to its own fallback until measured, and is a row on the Dimensions tab", () => {
    const r = resolveDims({ name: "Ear Comfort Pad", category: "accessories" });
    expect(r).toMatchObject({ key: EAR_PAD_KEY, kind: "pouch", source: "fallback" });
    expect(r.dims).toMatchObject({ widthMm: 180, lengthMm: 180, thicknessMm: 40, minThicknessMm: 18 });
    const row = pouchCatalog(CODE_REGISTRY).find((p) => p.key === EAR_PAD_KEY);
    expect(row).toMatchObject({ label: "Ear Comfort Pad", source: "unmeasured", dims: r.dims });
  });

  it("takes a Settings row over the fallback", () => {
    const registry = {
      ...CODE_REGISTRY,
      pouches: { [EAR_PAD_KEY]: { widthMm: 200, lengthMm: 190, thicknessMm: 35, minThicknessMm: 15, minWidthMm: 190, measuredOn: "2026-11-04" } },
      configured: new Set([EAR_PAD_KEY]),
    };
    expect(resolveDims({ name: "Ear Comfort Pad", category: "accessories" }, registry)).toMatchObject({
      source: "configured",
      dims: { widthMm: 200, thicknessMm: 35 },
    });
  });
});

describe("its well", () => {
  const well = padWellOf(SOFT_BODY_DEFAULTS);

  it("dips its full depth across the sewn floor, rising smoothly to nothing at the rim", () => {
    expect(wellDip(0.5, well)).toBe(well.depth);
    expect(wellDip(0.5 + well.width / 2, well)).toBe(0);
    expect(wellDip(0.1, well)).toBe(0);
    const mid = wellDip(0.5 + well.width * 0.35, well);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(well.depth);
    expect(wellDip(0.5, { width: 0.3, depth: 0 })).toBe(0);
  });

  it("side-on: the top dips in the middle, the underside stays flat on what it rests on", () => {
    const box = { x: 100, y: 50, w: 200, h: 40 };
    const ring = padRing(box, well, 40);
    expect(ring).toHaveLength(40);
    const topAt = (x: number) => Math.min(...ring.filter((p) => Math.abs(p[0] - x) < 6).map((p) => p[1]));
    const bottom = Math.max(...ring.map((p) => p[1]));
    expect(topAt(150)).toBeLessThan(box.y + 8);
    expect(topAt(200) - box.y).toBeGreaterThan(well.depth * box.h * 0.8);
    expect(bottom).toBeCloseTo(box.y + box.h, 0);
    expect(pouchPath(box, 1, { well })).not.toBe(pouchPath(box, 1));
    expect(pouchPath(box, 1, { well: { width: 0.3, depth: 0 } })).toBe(pouchPath(box, 1));
  });

  it("from above: a ring at the middle of the pad, its share of the width across, never past 0.8 of the short side", () => {
    const outline = (w: number, h: number) => {
      const pts = pouchOutline({ x: 10, y: 20, w, h }, 8, "ear");
      return `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
    };
    const c = earWellCircle(outline(100, 80), 0.32)!;
    expect(c.cx).toBeCloseTo(60, 0);
    expect(c.cy).toBeCloseTo(60, 0);
    expect(c.r).toBeCloseTo(16, 0);
    expect(earWellCircle(outline(100, 30), 0.6)!.r).toBeCloseTo(12, 0);
    expect(earWellCircle(outline(100, 80), 0)).toBeNull();
  });
});

describe("its soft settle", () => {
  const frame = {
    outline: [
      [0, 0],
      [400, 0],
      [400, 200],
      [0, 200],
    ] as Pt[],
    baseline: 200,
    width: 400,
    height: 200,
  };
  const well = padWellOf(SOFT_BODY_DEFAULTS);
  const box = { x: 100, y: 120, w: 200, h: 70 };

  const settle = (padFirmness: number) => {
    const ring = padRing(box, well, 40);
    const sim = createSettle([{ id: "ear", ring, rest: ring, kind: "pad" }], frame, { padFirmness });
    sim.step(sim.steps);
    return sim.snapshot().bodies[0].ring;
  };
  const dipOf = (ring: Pt[]) => {
    const top = (x0: number, x1: number) => Math.min(...ring.filter((p) => p[0] > x0 && p[0] < x1).map((p) => p[1]));
    return top(185, 215) - top(120, 150);
  };

  it("keeps its well: the middle stays below the rims", () => {
    const ring = settle(0.6);
    expect(dipOf(ring)).toBeGreaterThan(well.depth * box.h * 0.5);
    expect(Math.abs(signedArea(ring))).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    expect(settle(0.6)).toEqual(settle(0.6));
  });

  it("holds its rim and well firmer the firmer it is set", () => {
    const rest = padRing(box, well, 40);
    const drift = (ring: Pt[]) => ring.reduce((a, p, i) => a + Math.hypot(p[0] - rest[i][0], p[1] - rest[i][1]), 0);
    expect(drift(settle(1))).toBeLessThanOrEqual(drift(settle(0)));
  });
});
