/**
 * Realized margin: product revenue after refund/dispute adjustment minus COGS.
 * Mirrors `order_margins` view logic for unit tests; checkout snapshots costs on
 * order_items, restocked returns reduce COGS via returned_quantity.
 */

import type { LedgerEntry } from "./money-ledger";

export interface OrderMarginTotals {
  orderId?: string;
  orderNumber: string;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  total: number;
  paidAt?: string | null;
}

export interface OrderMarginItemInput {
  unitCost?: number | null;
  totalCost?: number | null;
  returnedQuantity?: number;
}

export interface ComputedOrderMargin {
  orderId?: string;
  orderNumber: string;
  revenue: number;
  discount: number;
  shipping: number;
  tax: number;
  cogs: number;
  netRevenue: number;
  grossMargin: number;
  marginPct: number | null;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function sumCogs(items: OrderMarginItemInput[]): number {
  let gross = 0;
  let restock = 0;
  for (const item of items) {
    gross += Number(item.totalCost ?? 0);
    restock += Number(item.unitCost ?? 0) * (item.returnedQuantity ?? 0);
  }
  return round2(gross - restock);
}

function netRevenue(
  totals: OrderMarginTotals,
  ledger: LedgerEntry[]
): number {
  if (ledger.length > 0) {
    return round2(ledger.reduce((sum, e) => sum + e.amount, 0));
  }
  if (totals.paidAt) return round2(totals.total);
  return round2(
    totals.subtotal -
      totals.discountAmount +
      totals.shippingAmount +
      totals.taxAmount
  );
}

function adjustedProductRevenue(
  productRevenue: number,
  total: number,
  netRev: number,
  hasLedger: boolean
): number {
  if (hasLedger && total > 0) return round2(productRevenue * (netRev / total));
  return round2(productRevenue);
}

/** Pure margin math — same rules as the `order_margins` view. */
export function computeOrderMargin(
  totals: OrderMarginTotals,
  items: OrderMarginItemInput[],
  ledger: LedgerEntry[] = []
): ComputedOrderMargin {
  const hasLedger = ledger.length > 0;
  const productRevenue = totals.subtotal - totals.discountAmount;
  const cogs = sumCogs(items);
  const netRev = netRevenue(totals, ledger);
  const adjusted = adjustedProductRevenue(
    productRevenue,
    totals.total,
    netRev,
    hasLedger
  );
  const grossMargin = round2(adjusted - cogs);
  const marginPct =
    adjusted > 0 ? round2((grossMargin / adjusted) * 100) : null;

  return {
    orderId: totals.orderId,
    orderNumber: totals.orderNumber,
    revenue: round2(totals.subtotal),
    discount: round2(totals.discountAmount),
    shipping: round2(totals.shippingAmount),
    tax: round2(totals.taxAmount),
    cogs,
    netRevenue: netRev,
    grossMargin,
    marginPct,
  };
}
