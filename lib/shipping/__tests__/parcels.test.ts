import { describe, expect, it } from "vitest";
import { buildParcels, MAX_PARCELS, packageTypeOf, typeBoxes } from "@/lib/shipping/parcels";
import type { ShippableLine } from "@/lib/shipping/types";

const doc = {
  boxes: [
    { name: "Pillow box", outer_length: 70, outer_width: 45, outer_height: 20, weight: 0 },
    { name: "Bolster box", outer_length: 60, outer_width: 25, outer_height: 25, weight: 0 },
    { name: "Accessory box", outer_length: 35, outer_width: 25, outer_height: 8, weight: 0 },
  ],
  box_for_type: {
    pillow: { box: "Pillow box", weight_grams: 1500 },
    bolster: { box: "Bolster box", weight_grams: 1200 },
    accessory: { box: "Accessory box", weight_grams: 400 },
  },
};
const packages = typeBoxes(doc);

const line = (over: Partial<ShippableLine>): ShippableLine => ({
  product_type: "pillow",
  quantity: 1,
  weight_grams: null,
  unit_value: 190,
  currency: "SGD",
  description: "Mpillow — M",
  sku: "MP-M",
  ...over,
});

describe("buildParcels", () => {
  it("boxes every pillow unit on its own, sized by the pillow's box", () => {
    const parcels = buildParcels([line({ quantity: 2 })], packages)!;
    expect(parcels).toHaveLength(2);
    for (const p of parcels) {
      expect([p.length_cm, p.width_cm, p.height_cm]).toEqual([70, 45, 20]);
      expect(p.weight_kg).toBe(1.5);
      expect(p.items).toEqual([expect.objectContaining({ quantity: 1, weight_kg: 1.5, declared_value: 190 })]);
    }
  });

  it("prefers the variant's own weight over the type's content weight", () => {
    const [p] = buildParcels([line({ weight_grams: 980 })], packages)!;
    expect(p.weight_kg).toBe(0.98);
  });

  it("rides accessories flat in the first box", () => {
    const parcels = buildParcels(
      [
        line({ product_type: "bolster" }),
        line({ product_type: "accessory", quantity: 3, weight_grams: 200, unit_value: 25, description: "Cover" }),
      ],
      packages,
    )!;
    expect(parcels).toHaveLength(1);
    expect([parcels[0].length_cm, parcels[0].width_cm, parcels[0].height_cm]).toEqual([60, 25, 25]);
    expect(parcels[0].weight_kg).toBe(1.8);
    expect(parcels[0].items).toHaveLength(2);
  });

  it("gives an accessories-only cart one accessory box", () => {
    const parcels = buildParcels(
      [
        line({ product_type: "accessory", quantity: 2, weight_grams: null }),
        line({ product_type: "accessory", quantity: 1, weight_grams: 100 }),
      ],
      packages,
    )!;
    expect(parcels).toHaveLength(1);
    expect([parcels[0].length_cm, parcels[0].width_cm, parcels[0].height_cm]).toEqual([35, 25, 8]);
    expect(parcels[0].weight_kg).toBe(0.9);
  });

  it("boxes a bundle as a pillow", () => {
    expect(packageTypeOf("bundle")).toBe("pillow");
  });

  it("is deterministic, so the page and the checkout route share a quote", () => {
    const lines = [line({ quantity: 2 }), line({ product_type: "accessory", weight_grams: 150 })];
    expect(buildParcels(lines, packages)).toEqual(buildParcels(lines, packages));
  });

  it("adds the box's empty weight to its contents", () => {
    const heavy = typeBoxes({ ...doc, boxes: doc.boxes.map((b) => ({ ...b, weight: 0.25 })) });
    const [p] = buildParcels([line({}), line({ product_type: "accessory", weight_grams: 200 })], heavy)!;
    expect(p.weight_kg).toBe(1.95);
  });

  it("follows the box a type is mapped to", () => {
    const swapped = typeBoxes({ ...doc, box_for_type: { ...doc.box_for_type, pillow: { box: "bolster BOX", weight_grams: 900 } } });
    const [p] = buildParcels([line({})], swapped)!;
    expect([p.length_cm, p.width_cm, p.height_cm, p.weight_kg]).toEqual([60, 25, 25, 0.9]);
  });

  it("gives no parcels when a type in the cart has no box, or its box is gone", () => {
    const noBolster = typeBoxes({ ...doc, box_for_type: { pillow: doc.box_for_type.pillow, accessory: doc.box_for_type.accessory } });
    expect(noBolster.bolster).toBeUndefined();
    expect(buildParcels([line({ product_type: "bolster" })], noBolster)).toBeNull();
    expect(buildParcels([line({})], noBolster)).toHaveLength(1);
    expect(typeBoxes({ ...doc, boxes: doc.boxes.slice(1) }).pillow).toBeUndefined();
    expect(typeBoxes(null)).toEqual({});
  });

  it("lets a weighed accessory ride without an accessory box, but not an unweighed one or one shipping alone", () => {
    const noAccessory = typeBoxes({ ...doc, box_for_type: { pillow: doc.box_for_type.pillow } });
    const [p] = buildParcels([line({}), line({ product_type: "accessory", weight_grams: 200 })], noAccessory)!;
    expect(p.items).toHaveLength(2);
    expect(buildParcels([line({}), line({ product_type: "accessory", weight_grams: null })], noAccessory)).toBeNull();
    expect(buildParcels([line({ product_type: "accessory", weight_grams: 200 })], noAccessory)).toBeNull();
  });

  it("refuses a cart that needs more boxes than a checkout quote should price", () => {
    expect(buildParcels([line({ quantity: MAX_PARCELS })], packages)).toHaveLength(MAX_PARCELS);
    expect(buildParcels([line({ quantity: MAX_PARCELS + 1 })], packages)).toBeNull();
  });
});
