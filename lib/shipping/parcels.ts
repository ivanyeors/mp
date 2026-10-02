import type { ProductType } from "@/lib/types/ecommerce";
import type {
  PackageProfile,
  PackageType,
  Parcel,
  ParcelItem,
  ShippableLine,
} from "@/lib/shipping/types";

/** More boxes than this is a wholesale order, not a checkout quote. */
export const MAX_PARCELS = 20;

/** Pillows and bolsters ship one unit per box; a bundle is boxed as a pillow. */
export function packageTypeOf(productType: ProductType): PackageType {
  if (productType === "bolster") return "bolster";
  if (productType === "accessory") return "accessory";
  return "pillow";
}

function kg(grams: number): number {
  return Math.round(grams) / 1000;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function itemOf(line: ShippableLine, profile: PackageProfile, quantity: number): ParcelItem {
  const grams = line.weight_grams != null && line.weight_grams > 0 ? line.weight_grams : profile.weight_grams;
  return {
    description: line.description,
    sku: line.sku ?? null,
    quantity,
    weight_kg: kg(grams),
    declared_value: Math.round(line.unit_value * 100) / 100,
    currency: line.currency,
  };
}

function parcelWeight(items: ParcelItem[]): number {
  return round3(items.reduce((sum, i) => sum + i.weight_kg * i.quantity, 0));
}

/**
 * Box a cart for a courier quote. Pure and deterministic: the same lines always
 * give the same parcels, which is what lets the checkout route reuse the quote
 * the checkout page was shown (same parcels → same cache key).
 *
 * - Every pillow, bolster or bundle unit is its own box, sized by its profile —
 *   they are bulky, so couriers price them by volume, not weight.
 * - Accessories (covers, cases, sprays) ride flat in the first box. With no box
 *   to ride in, they share one accessory box.
 *
 * Returns null when the cart needs more than MAX_PARCELS boxes.
 */
export function buildParcels(
  lines: ShippableLine[],
  packages: Record<PackageType, PackageProfile>,
): Parcel[] | null {
  const boxes: Parcel[] = [];
  const loose: ParcelItem[] = [];

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const type = packageTypeOf(line.product_type);
    const profile = packages[type];
    if (type === "accessory") {
      loose.push(itemOf(line, profile, line.quantity));
      continue;
    }
    for (let n = 0; n < line.quantity; n++) {
      if (boxes.length >= MAX_PARCELS) return null;
      const items = [itemOf(line, profile, 1)];
      boxes.push({
        length_cm: profile.length_cm,
        width_cm: profile.width_cm,
        height_cm: profile.height_cm,
        weight_kg: parcelWeight(items),
        items,
      });
    }
  }

  if (loose.length > 0) {
    if (boxes.length > 0) {
      const first = boxes[0];
      first.items.push(...loose);
      first.weight_kg = parcelWeight(first.items);
    } else {
      const profile = packages.accessory;
      boxes.push({
        length_cm: profile.length_cm,
        width_cm: profile.width_cm,
        height_cm: profile.height_cm,
        weight_kg: parcelWeight(loose),
        items: loose,
      });
    }
  }

  return boxes;
}
