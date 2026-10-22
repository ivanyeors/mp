/**
 * Customer purchases report: every customer payment and every refund in a
 * period, for the accounts team to tick against Stripe and the bank.
 *
 * Cash basis, one row per money movement:
 * - a **sale** is an **Order** dated by `paid_at` (CONTEXT.md: sales windows
 *   use `paid_at`, never `created_at`), for the amount charged (`total`, which
 *   the Stripe webhook writes back from the completed session);
 * - a **refund** is a row of the money ledger (`order_payments`) dated when the
 *   money moved, so a refund in November for an October sale is in November;
 * - the **Shopify order mirror** contributes its paid orders and refunds the
 *   same way. Shopify is ad hoc, but its sales were still real money.
 *
 * Ledger rows taken: `refund` (money back to the customer), `dispute_loss` (a
 * chargeback the customer won) and `adjustment` (a failed refund reversed, or a
 * manual correction). Not taken: `charge` (the sale row already is the charge),
 * `fee` (a Stripe dispute fee is a cost of Stripe, not a customer payment; it
 * belongs with the processing fees) and `dispute_hold` / `dispute_won`, which
 * nothing writes and which net to zero.
 *
 * Pure: the loader (`load-customer-purchases.ts`) fetches the facts.
 */

import { toCsv } from "@/lib/csv";
import { sgtDate, sgtTime, type ReportPeriod } from "./period";

export type SaleType = "Shop" | "Customisation" | "Re-adjustment" | "Service" | "Shopify";

export type PurchaseRowKind = "sale" | "refund" | "dispute_loss" | "refund_reversed" | "adjustment";

export type PurchaseChannel = "platform" | "shopify";

/** A paid platform Order. */
export type PlatformSaleFact = {
  orderId: string;
  orderNumber: string;
  paidAt: string;
  status: string;
  currency: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  paymentReference: string | null;
  customerName: string;
  saleType: SaleType;
};

/** One `order_payments` row, with the Order it belongs to. */
export type PlatformLedgerFact = {
  orderNumber: string;
  type: string;
  amount: number;
  currency: string;
  createdAt: string;
  stripeObjectId: string | null;
  /** `metadata.kind`, e.g. `refund_reversal`. */
  metadataKind: string | null;
  customerName: string;
  saleType: SaleType;
  orderStatus: string;
};

/** A paid order in the Shopify order mirror. */
export type ShopifySaleFact = {
  shopifyOrderId: string;
  name: string | null;
  paidAt: string;
  currency: string;
  totalPrice: number;
  financialStatus: string | null;
};

/** A refund in the Shopify order mirror. */
export type ShopifyRefundFact = {
  shopifyRefundId: string;
  orderName: string | null;
  amount: number;
  currency: string;
  refundedAt: string;
};

export type PurchaseRow = {
  /** The instant the money moved (UTC ISO). */
  at: string;
  kind: PurchaseRowKind;
  channel: PurchaseChannel;
  saleType: SaleType;
  /** Order number (`MP-…`) or Shopify order name (`#1042`). */
  reference: string;
  /** Stripe PaymentIntent, refund or dispute id; empty for Shopify. */
  paymentReference: string;
  customer: string;
  status: string;
  currency: string;
  /** Breakdown of a platform sale; null elsewhere. */
  subtotal: number | null;
  discount: number | null;
  shipping: number | null;
  tax: number | null;
  /** Signed: money in is positive, money back to a customer negative. */
  amount: number;
};

export type PurchaseTotals = {
  currency: string;
  saleCount: number;
  /** Sum of sales. */
  sales: number;
  /** GST on platform sales (Shopify mirror carries none). */
  tax: number;
  /** Sum of refunds, dispute losses and adjustments; usually negative. */
  refunds: number;
  /** sales + refunds. */
  net: number;
};

export type CustomerPurchasesReport = {
  period: ReportPeriod;
  generatedAt: string;
  rows: PurchaseRow[];
  /** One entry per currency, platform and Shopify together; SGD first. */
  totals: PurchaseTotals[];
  /** Per channel, for the summary. */
  byChannel: Record<PurchaseChannel, PurchaseTotals[]>;
};

const LEDGER_KINDS: Record<string, PurchaseRowKind> = {
  refund: "refund",
  dispute_loss: "dispute_loss",
  adjustment: "adjustment",
};

export const KIND_LABELS: Record<PurchaseRowKind, string> = {
  sale: "Sale",
  refund: "Refund",
  dispute_loss: "Dispute lost",
  refund_reversed: "Refund reversed",
  adjustment: "Adjustment",
};

export const CHANNEL_LABELS: Record<PurchaseChannel, string> = {
  platform: "Mpillow",
  shopify: "Shopify",
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * What a platform Order sold, from its lines. Result Orders carry
 * `RESULT-…` goods SKUs (`/api/results/[id]/accept`); a re-adjustment fee Order
 * is a single `readjustment` service line; everything else came through the shop.
 */
export function saleTypeOf(
  items: ReadonlyArray<{ sku: string | null; kind: string | null; service_key: string | null }>,
): SaleType {
  if (items.some((i) => (i.sku ?? "").startsWith("RESULT-"))) return "Customisation";
  if (items.length > 0 && items.every((i) => i.kind === "service")) {
    return items.some((i) => i.service_key === "readjustment") ? "Re-adjustment" : "Service";
  }
  return "Shop";
}

/** `First Last`, else the shipping recipient, else empty. */
export function customerNameOf(
  customer: { first_name: string | null; last_name: string | null } | null | undefined,
  shippingAddress: unknown,
): string {
  const name = [customer?.first_name, customer?.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (name) return name;
  const recipient = (shippingAddress as { recipient?: unknown } | null)?.recipient;
  return typeof recipient === "string" ? recipient.trim() : "";
}

function inPeriod(iso: string, fromIso: string, toExclusiveIso: string): boolean {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= new Date(fromIso).getTime() && t < new Date(toExclusiveIso).getTime();
}

function totalsOf(rows: readonly PurchaseRow[]): PurchaseTotals[] {
  const by = new Map<string, PurchaseTotals>();
  for (const r of rows) {
    const t = by.get(r.currency) ?? {
      currency: r.currency,
      saleCount: 0,
      sales: 0,
      tax: 0,
      refunds: 0,
      net: 0,
    };
    if (r.kind === "sale") {
      t.saleCount += 1;
      t.sales = round2(t.sales + r.amount);
      t.tax = round2(t.tax + (r.tax ?? 0));
    } else {
      t.refunds = round2(t.refunds + r.amount);
    }
    t.net = round2(t.sales + t.refunds);
    by.set(r.currency, t);
  }
  return [...by.values()].sort((a, b) =>
    a.currency === "SGD" ? -1 : b.currency === "SGD" ? 1 : a.currency.localeCompare(b.currency),
  );
}

export function buildCustomerPurchasesReport(input: {
  period: ReportPeriod & { fromIso: string; toExclusiveIso: string };
  generatedAt: string;
  platformSales: readonly PlatformSaleFact[];
  platformLedger: readonly PlatformLedgerFact[];
  shopifySales: readonly ShopifySaleFact[];
  shopifyRefunds: readonly ShopifyRefundFact[];
}): CustomerPurchasesReport {
  const { fromIso, toExclusiveIso } = input.period;
  const within = (iso: string | null | undefined) => !!iso && inPeriod(iso, fromIso, toExclusiveIso);
  const rows: PurchaseRow[] = [];

  for (const s of input.platformSales) {
    if (!within(s.paidAt)) continue;
    rows.push({
      at: s.paidAt,
      kind: "sale",
      channel: "platform",
      saleType: s.saleType,
      reference: s.orderNumber,
      paymentReference: s.paymentReference ?? "",
      customer: s.customerName,
      status: s.status,
      currency: s.currency.toUpperCase(),
      subtotal: round2(num(s.subtotal)),
      discount: round2(num(s.discount)),
      shipping: round2(num(s.shipping)),
      tax: round2(num(s.tax)),
      amount: round2(num(s.total)),
    });
  }

  for (const l of input.platformLedger) {
    const base = LEDGER_KINDS[l.type];
    if (!base || !within(l.createdAt)) continue;
    const kind: PurchaseRowKind =
      base === "adjustment" && l.metadataKind === "refund_reversal" ? "refund_reversed" : base;
    rows.push({
      at: l.createdAt,
      kind,
      channel: "platform",
      saleType: l.saleType,
      reference: l.orderNumber,
      paymentReference: l.stripeObjectId ?? "",
      customer: l.customerName,
      status: l.orderStatus,
      currency: l.currency.toUpperCase(),
      subtotal: null,
      discount: null,
      shipping: null,
      tax: null,
      amount: round2(num(l.amount)),
    });
  }

  for (const s of input.shopifySales) {
    if (!within(s.paidAt)) continue;
    rows.push({
      at: s.paidAt,
      kind: "sale",
      channel: "shopify",
      saleType: "Shopify",
      reference: s.name ?? s.shopifyOrderId,
      paymentReference: "",
      customer: "",
      status: s.financialStatus ?? "",
      currency: s.currency.toUpperCase(),
      subtotal: null,
      discount: null,
      shipping: null,
      tax: null,
      amount: round2(num(s.totalPrice)),
    });
  }

  for (const r of input.shopifyRefunds) {
    if (!within(r.refundedAt)) continue;
    rows.push({
      at: r.refundedAt,
      kind: "refund",
      channel: "shopify",
      saleType: "Shopify",
      reference: r.orderName ?? "",
      paymentReference: "",
      customer: "",
      status: "",
      currency: r.currency.toUpperCase(),
      subtotal: null,
      discount: null,
      shipping: null,
      tax: null,
      // The mirror stores refunds as positive amounts.
      amount: -Math.abs(round2(num(r.amount))),
    });
  }

  rows.sort((a, b) => a.at.localeCompare(b.at) || a.reference.localeCompare(b.reference));

  return {
    period: { from: input.period.from, to: input.period.to },
    generatedAt: input.generatedAt,
    rows,
    totals: totalsOf(rows),
    byChannel: {
      platform: totalsOf(rows.filter((r) => r.channel === "platform")),
      shopify: totalsOf(rows.filter((r) => r.channel === "shopify")),
    },
  };
}

export const CSV_HEADER = [
  "Date (SGT)",
  "Time (SGT)",
  "Type",
  "Channel",
  "Sale type",
  "Order",
  "Payment reference",
  "Customer",
  "Order status",
  "Currency",
  "Subtotal",
  "Discount",
  "Shipping",
  "GST",
  "Amount",
] as const;

function amountCell(n: number | null): string {
  return n == null ? "" : n.toFixed(2);
}

/**
 * Free text a customer typed (a name) or a value from outside (a status). A
 * spreadsheet runs a cell that starts with `=`, `+`, `-` or `@` as a formula,
 * so such a value is prefixed with an apostrophe and shown as text (CSV
 * injection). Amount cells never pass through here: a refund is meant to be `-40.00`.
 */
export function textCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/**
 * The report as one CSV: one row per money movement, signed amounts, plain
 * numbers (no currency symbol) so a spreadsheet sums the Amount column to the
 * net. Starts with a UTF-8 byte order mark so Excel reads non-Latin names.
 */
export function customerPurchasesCsv(report: CustomerPurchasesReport): string {
  const body = report.rows.map((r) => [
    sgtDate(r.at),
    sgtTime(r.at),
    KIND_LABELS[r.kind],
    CHANNEL_LABELS[r.channel],
    r.saleType,
    textCell(r.reference),
    textCell(r.paymentReference),
    textCell(r.customer),
    textCell(r.status),
    r.currency,
    amountCell(r.subtotal),
    amountCell(r.discount),
    amountCell(r.shipping),
    amountCell(r.tax),
    amountCell(r.amount),
  ]);
  return `﻿${toCsv(CSV_HEADER, body)}\r\n`;
}
