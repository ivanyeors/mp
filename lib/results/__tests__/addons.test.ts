import { describe, it, expect } from "vitest";
import {
  accessoryFitsProduct,
  addonMatchRank,
  addonsForAnswers,
  keepOfferedAddons,
  suggestAddons,
} from "@/lib/results/addons";

const prices = new Map([
  [1, { msrp: 20, currency: "SGD" }],
  [2, { msrp: 22, currency: "SGD" }],
  [3, { msrp: 18, currency: "SGD" }],
  [4, { msrp: 15, currency: "SGD" }],
  [5, { msrp: 12, currency: "SGD" }],
  [6, { msrp: 30, currency: "SGD" }],
  [7, { msrp: 25, currency: "SGD" }],
]);

const catalog = [
  { id: 1, name: "Cervical Neck Support", size: null },
  { id: 2, name: "Cervical Neck Support", size: "M" },
  { id: 3, name: "Travel Pouch", size: "XS" },
  { id: 4, name: "Bolster Sleeve", size: "BOLSTER" },
  { id: 5, name: "Bolster Sleeve", size: "medium" },
  { id: 6, name: "Knee Support", size: "S" },
  { id: 7, name: "Bolster Tie", size: "long" },
];

describe("accessoryFitsProduct", () => {
  it("keeps one-size and matching pillow size; drops other sizes and bolster tags", () => {
    expect(accessoryFitsProduct({ size: null }, "pillow", "M")).toBe(true);
    expect(accessoryFitsProduct({ size: "M" }, "pillow", "M")).toBe(true);
    expect(accessoryFitsProduct({ size: "XS" }, "pillow", "M")).toBe(false);
    expect(accessoryFitsProduct({ size: "BOLSTER" }, "pillow", "M")).toBe(false);
    expect(accessoryFitsProduct({ size: "medium" }, "pillow", "M")).toBe(false);
  });

  it("keeps bolster length / BOLSTER only; drops pillow sizes and one-size", () => {
    expect(accessoryFitsProduct({ size: "BOLSTER" }, "bolster", "medium")).toBe(true);
    expect(accessoryFitsProduct({ size: "medium" }, "bolster", "medium")).toBe(true);
    expect(accessoryFitsProduct({ size: "M" }, "bolster", "medium")).toBe(false);
    expect(accessoryFitsProduct({ size: "long" }, "bolster", "medium")).toBe(false);
    expect(accessoryFitsProduct({ size: null }, "bolster", "medium")).toBe(false);
    expect(accessoryFitsProduct({ size: "XS" }, "bolster", "medium")).toBe(false);
  });
});

describe("suggestAddons", () => {
  it("suggests pillow add-ons sized to the recommendation (prefers exact size)", () => {
    const addons = suggestAddons(catalog, prices, { productType: "pillow", sizeKey: "M" });
    expect(addons.map((a) => a.name).sort()).toEqual(["Cervical Neck Support"]);
    expect(addons.find((a) => a.name === "Cervical Neck Support")?.item_id).toBe(2);
    expect(addons.find((a) => a.name === "Cervical Neck Support")?.msrp).toBe(22);
    expect(addons.some((a) => a.name === "Travel Pouch")).toBe(false);
    expect(addons.some((a) => a.name.includes("Bolster"))).toBe(false);
  });

  it("suggests bolster add-ons for length, not pillow one-size accessories", () => {
    const addons = suggestAddons(catalog, prices, {
      productType: "bolster",
      sizeKey: "medium",
    });
    expect(addons.map((a) => a.name).sort()).toEqual(["Bolster Sleeve"]);
    expect(addons.find((a) => a.name === "Bolster Sleeve")?.item_id).toBe(5);
    expect(addons.some((a) => a.name === "Cervical Neck Support")).toBe(false);
    expect(addons.some((a) => a.name === "Travel Pouch")).toBe(false);
  });

  it("ranks exact length above BOLSTER", () => {
    expect(addonMatchRank({ size: "medium" }, "bolster", "medium")).toBeGreaterThan(
      addonMatchRank({ size: "BOLSTER" }, "bolster", "medium"),
    );
  });
});

describe("addonsForAnswers", () => {
  const offered = [
    { item_id: 62, name: "Cervical Neck Support" },
    { item_id: 41, name: "Ear Comfort Pad" },
    { item_id: 93, name: "Slope Mattress" },
  ];

  it("offers the Ear Comfort Pad on a yes to ear discomfort", () => {
    expect(addonsForAnswers(offered, { earDiscomfortSideSleep: "yes" })).toEqual(offered);
  });

  it("hides it on a no or no answer, and keeps everything else", () => {
    for (const answer of ["no", "", undefined, null]) {
      expect(
        addonsForAnswers(offered, { earDiscomfortSideSleep: answer }).map((a) => a.name),
      ).toEqual(["Cervical Neck Support", "Slope Mattress"]);
    }
  });
});

describe("keepOfferedAddons", () => {
  const picked = new Set([62, 41]);

  it("keeps a sized pick while the build's size is unknown", () => {
    const unscoped = [{ item_id: 63 }, { item_id: 41 }];
    expect([...keepOfferedAddons(picked, unscoped, null)].sort()).toEqual([41, 62]);
    expect([...keepOfferedAddons(picked, unscoped, "")].sort()).toEqual([41, 62]);
  });

  it("drops picks the size-scoped list no longer offers", () => {
    expect([...keepOfferedAddons(picked, [{ item_id: 62 }, { item_id: 41 }], "M")].sort()).toEqual([
      41, 62,
    ]);
    expect([...keepOfferedAddons(picked, [{ item_id: 63 }], "L")]).toEqual([]);
  });

  it("never hands back the caller's set", () => {
    expect(keepOfferedAddons(picked, [], null)).not.toBe(picked);
  });
});
