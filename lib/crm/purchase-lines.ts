import { PILLOW_SIZES, PURCHASE_CLASSES, type PillowSize, type PurchaseClass } from "@/lib/crm/customer-overview";
import {
  NOT_A_PURCHASE,
  classifyOrderLine,
  type OrderLineRow,
  type OrderRow,
} from "@/lib/readjustment/purchases";

export interface PurchaseLine {
  product_type: "pillow" | "bolster" | "accessory";
  tier: "premium" | "basic" | null;
  size: string | null;
}

type PillowById = Parameters<typeof classifyOrderLine>[1];

export function isCountedOrder(order: Pick<OrderRow, "paid_at" | "status">): boolean {
  return Boolean(order.paid_at) && !NOT_A_PURCHASE.has(order.status);
}

export function purchaseLine(line: OrderLineRow, pillowById: PillowById): PurchaseLine | null {
  if (line.kind === "service") return null;
  const c = classifyOrderLine(line, pillowById);
  if (!c) return { product_type: "accessory", tier: null, size: null };
  return { product_type: c.productType, tier: c.tier, size: c.productType === "pillow" ? c.size : null };
}

export function purchaseClass(line: PurchaseLine): PurchaseClass | null {
  if (line.product_type === "bolster") return "mbolster";
  if (line.product_type === "accessory") return "accessory";
  return line.tier;
}

export function pillowSizes(lines: readonly PurchaseLine[]): PillowSize[] {
  const seen = new Set(lines.filter((l) => l.product_type === "pillow").map((l) => l.size?.trim().toUpperCase()));
  return PILLOW_SIZES.filter((size) => seen.has(size));
}

export function boughtClasses(lines: readonly PurchaseLine[]): PurchaseClass[] {
  const seen = new Set(lines.map(purchaseClass));
  return PURCHASE_CLASSES.filter((c) => seen.has(c));
}
