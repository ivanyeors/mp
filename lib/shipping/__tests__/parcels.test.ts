import { describe, expect, it } from "vitest";
import { buildParcels, MAX_PARCELS, packageTypeOf } from "@/lib/shipping/parcels";
import { DEFAULT_SHIPPING_SETTINGS } from "@/lib/shipping/settings";
import type { ShippableLine } from "@/lib/shipping/types";

const packages = DEFAULT_SHIPPING_SETTINGS.packages;

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
  it("boxes every pillow unit on its own, sized by the pillow profile", () => {
    const parcels = buildParcels([line({ quantity: 2 })], packages)!;
    expect(parcels).toHaveLength(2);
    for (const p of parcels) {
      expect([p.length_cm, p.width_cm, p.height_cm]).toEqual([70, 45, 20]);
      expect(p.weight_kg).toBe(1.5);
      expect(p.items).toEqual([expect.objectContaining({ quantity: 1, weight_kg: 1.5, declared_value: 190 })]);
    }
  });

  it("prefers the variant's own weight over the profile's", () => {
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
    // 1.2 kg bolster + 3 × 0.2 kg covers
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

  it("refuses a cart that needs more boxes than a checkout quote should price", () => {
    expect(buildParcels([line({ quantity: MAX_PARCELS })], packages)).toHaveLength(MAX_PARCELS);
    expect(buildParcels([line({ quantity: MAX_PARCELS + 1 })], packages)).toBeNull();
  });
});
