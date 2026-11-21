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

export const MAX_PARCELS = 20;

export function packageTypeOf(productType: ProductType): PackageType {
  if (productType === "bolster") return "bolster";
  if (productType === "accessory") return "accessory";
  return "pillow";
}

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

export function buildParcels(lines: ShippableLine[], boxes: TypeBoxes): Parcel[] | null {
  const parcels: Parcel[] = [];
  let firstBox: TypeBox | null = null;
  const loose: ParcelItem[] = [];

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const type = packageTypeOf(line.product_type);
    const box = boxes[type];
    if (type === "accessory") {
      const weighed = line.weight_grams != null && line.weight_grams > 0;
      if (!box && !weighed) return null;
      loose.push(itemOf(line, box ?? { length_cm: 0, width_cm: 0, height_cm: 0, weight_grams: 0 }, line.quantity));
      continue;
    }
    if (!box) return null;
    for (let n = 0; n < line.quantity; n++) {
      if (parcels.length >= MAX_PARCELS) return null;
      parcels.push(parcelOf(box, [itemOf(line, box, 1)]));
      firstBox ??= box;
    }
  }

  if (loose.length > 0) {
    if (firstBox) parcels[0] = parcelOf(firstBox, [...parcels[0].items, ...loose]);
    else if (boxes.accessory) parcels.push(parcelOf(boxes.accessory, loose));
    else return null;
  }

  return parcels;
}
