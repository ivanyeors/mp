import type { ProductType } from "@/lib/types/ecommerce";
import { BOX_TYPES, type EasyshipSettings } from "@/lib/easyship/schema";
import type {
  PackageProfile,
  PackageType,
  Parcel,
  ParcelItem,
  ShippableLine,
  TypeBox,
  TypeBoxes,
} from "@/lib/shipping/types";

/** More boxes than this is a wholesale order, not a checkout quote. */
export const MAX_PARCELS = 20;

/** Pillows and bolsters ship one unit per box; a bundle is boxed as a pillow. */
export function packageTypeOf(productType: ProductType): PackageType {
  if (productType === "bolster") return "bolster";
  if (productType === "accessory") return "accessory";
  return "pillow";
}

/** Each type's mapped courier-account box (cm, kg) as parcel inputs; a missing or dangling mapping is left out. */
export function typeBoxes(doc: Pick<EasyshipSettings, "boxes" | "box_for_type"> | null | undefined): TypeBoxes {
  const out: TypeBoxes = {};
  for (const type of BOX_TYPES) {
    const map = doc?.box_for_type[type];
    const box = map && doc.boxes.find((b) => b.name.trim().toLowerCase() === map.box.trim().toLowerCase());
    if (!map || !box) continue;
    out[type] = {
      length_cm: box.outer_length,
      width_cm: box.outer_width,
      height_cm: box.outer_height,
      tare_grams: Math.round(box.weight * 1000),
      weight_grams: map.weight_grams,
    };
  }
  return out;
}

function kg(grams: number): number {
  return Math.round(grams) / 1000;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function itemOf(line: ShippableLine, box: PackageProfile, quantity: number): ParcelItem {
  const grams = line.weight_grams != null && line.weight_grams > 0 ? line.weight_grams : box.weight_grams;
  return {
    description: line.description,
    sku: line.sku ?? null,
    quantity,
    weight_kg: kg(grams),
    declared_value: Math.round(line.unit_value * 100) / 100,
    currency: line.currency,
  };
}

function parcelWeight(items: ParcelItem[], box: TypeBox): number {
  return round3(kg(box.tare_grams) + items.reduce((sum, i) => sum + i.weight_kg * i.quantity, 0));
}

function parcelOf(box: TypeBox, items: ParcelItem[]): Parcel {
  return { length_cm: box.length_cm, width_cm: box.width_cm, height_cm: box.height_cm, weight_kg: parcelWeight(items, box), items };
}

/**
 * Box a cart for a courier quote. Pure and deterministic: the same lines always
 * give the same parcels, which is what lets the checkout route reuse the quote
 * the checkout page was shown (same parcels → same cache key).
 *
 * - Every pillow, bolster or bundle unit is its own box, sized by its type's
 *   box — they are bulky, so couriers price them by volume, not weight.
 * - Accessories (covers, cases, sprays) ride flat in the first box. With no box
 *   to ride in, they share one accessory box.
 * - A parcel weighs its box's empty weight plus its contents.
 *
 * Returns null when the cart needs more than MAX_PARCELS boxes, or a line's type has no box.
 */
export function buildParcels(lines: ShippableLine[], boxes: TypeBoxes): Parcel[] | null {
  const parcels: Parcel[] = [];
  let firstBox: TypeBox | null = null;
  const loose: ParcelItem[] = [];

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const type = packageTypeOf(line.product_type);
    const box = boxes[type];
    if (!box) return null;
    if (type === "accessory") {
      loose.push(itemOf(line, box, line.quantity));
      continue;
    }
    for (let n = 0; n < line.quantity; n++) {
      if (parcels.length >= MAX_PARCELS) return null;
      parcels.push(parcelOf(box, [itemOf(line, box, 1)]));
      firstBox ??= box;
    }
  }

  if (loose.length > 0) {
    // Accessories have a box here: an unmapped type already returned null.
    if (firstBox) parcels[0] = parcelOf(firstBox, [...parcels[0].items, ...loose]);
    else parcels.push(parcelOf(boxes.accessory!, loose));
  }

  return parcels;
}
