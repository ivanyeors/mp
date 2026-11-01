import { PILLOW_SIZES, PURCHASE_CLASSES, type PillowSize, type PurchaseClass } from "@/lib/crm/customer-overview";
import {
  NOT_A_PURCHASE,
  classifyOrderLine,
  type OrderLineRow,
  type OrderRow,
} from "@/lib/readjustment/purchases";

/**
 * What each Customer bought (CRM slice 04), in TypeScript: the twin of the SQL
 * view `customer_purchase_lines` (20261020122000) and of the overview's
 * `bought` column.
 *
 * SQL is the authority the Customers list filters on; this is
 * `classifyOrderLine`, the rule the re-adjustment picker already uses, read the
 * way the view reads it. lib/crm/purchase-lines.check.ts runs both over the
 * same fixture lines and over every line in a database, and fails on any
 * difference.
 */

/** One row of `customer_purchase_lines`, less its keys. */
export interface PurchaseLine {
  product_type: "pillow" | "bolster" | "accessory";
  tier: "premium" | "basic" | null;
  /** A pillow's size as the line holds it (PRD-campaign-audiences slice 04); null otherwise. */
  size: string | null;
}

type PillowById = Parameters<typeof classifyOrderLine>[1];

/** A paid Order whose money was not given back: the Orders the overview counts. */
export function isCountedOrder(order: Pick<OrderRow, "paid_at" | "status">): boolean {
  return Boolean(order.paid_at) && !NOT_A_PURCHASE.has(order.status);
}

/**
 * The view's row for one line of a counted Order, or null for a Service line,
 * which the view leaves out. `classifyOrderLine`'s null on a goods line (no
 * pillow, no bolster) is an accessory.
 */
export function purchaseLine(line: OrderLineRow, pillowById: PillowById): PurchaseLine | null {
  if (line.kind === "service") return null;
  const c = classifyOrderLine(line, pillowById);
  if (!c) return { product_type: "accessory", tier: null, size: null };
  return { product_type: c.productType, tier: c.tier, size: c.productType === "pillow" ? c.size : null };
}

/** The class a line adds to `bought`: null for a pillow of no known Tier. */
export function purchaseClass(line: PurchaseLine): PurchaseClass | null {
  if (line.product_type === "bolster") return "mbolster";
  if (line.product_type === "accessory") return "accessory";
  return line.tier;
}

/** The overview's `pillow_sizes` for a Customer's lines: each pillow's size, trimmed and upper-cased, XS to XL. */
export function pillowSizes(lines: readonly PurchaseLine[]): PillowSize[] {
  const seen = new Set(lines.filter((l) => l.product_type === "pillow").map((l) => l.size?.trim().toUpperCase()));
  return PILLOW_SIZES.filter((size) => seen.has(size));
}

/** The overview's `bought` for a Customer's lines, in `PURCHASE_CLASSES` order. */
export function boughtClasses(lines: readonly PurchaseLine[]): PurchaseClass[] {
  const seen = new Set(lines.map(purchaseClass));
  return PURCHASE_CLASSES.filter((c) => seen.has(c));
}
