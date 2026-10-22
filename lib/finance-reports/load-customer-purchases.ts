/**
 * Loads the facts for the customer purchases report from the database.
 *
 * DB only, like the rest of Analytics (ADR 0006): platform Orders and their
 * money ledger, and the Shopify order mirror. No Stripe or Shopify API call.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import {
  buildCustomerPurchasesReport,
  customerNameOf,
  saleTypeOf,
  type CustomerPurchasesReport,
  type PlatformLedgerFact,
  type PlatformSaleFact,
  type ShopifyRefundFact,
  type ShopifySaleFact,
} from "./customer-purchases";
import type { ReportPeriodBounds } from "./period";

/** PostgREST caps a response at 1000 rows; read in pages of that size. */
const PAGE = 1000;

type Page<T> = { data: T[] | null; error: { message: string } | null };

async function readAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

type CustomerJoin = { first_name: string | null; last_name: string | null } | null;
type ItemJoin = { sku: string | null; kind: string | null; service_key: string | null };

type OrderRow = {
  id: string;
  order_number: string;
  paid_at: string;
  status: string;
  currency: string | null;
  subtotal: number | string;
  discount_amount: number | string;
  shipping_amount: number | string;
  tax_amount: number | string;
  total: number | string;
  payment_reference: string | null;
  shipping_address: unknown;
  customer: CustomerJoin | CustomerJoin[];
  items: ItemJoin[] | null;
};

type LedgerOrderJoin = Pick<OrderRow, "order_number" | "status" | "shipping_address" | "customer" | "items">;

type LedgerRow = {
  id: string;
  type: string;
  amount: number | string;
  currency: string | null;
  created_at: string;
  stripe_object_id: string | null;
  metadata: { kind?: unknown } | null;
  order: LedgerOrderJoin | LedgerOrderJoin[] | null;
};

type ShopifyOrderRow = {
  shopify_order_id: number | string;
  name: string | null;
  paid_at: string;
  currency: string | null;
  total_price: number | string;
  financial_status: string | null;
};

type ShopifyRefundRow = {
  shopify_refund_id: number | string;
  amount: number | string;
  currency: string | null;
  refunded_at: string;
  order: { name: string | null } | { name: string | null }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const ORDER_COLUMNS =
  "id, order_number, paid_at, status, currency, subtotal, discount_amount, shipping_amount, tax_amount, total, payment_reference, shipping_address, customer:customers(first_name, last_name), items:order_items(sku, kind, service_key)";

const LEDGER_COLUMNS =
  "id, type, amount, currency, created_at, stripe_object_id, metadata, order:orders(order_number, status, shipping_address, customer:customers(first_name, last_name), items:order_items(sku, kind, service_key))";

/** The ledger types the report shows; see `customer-purchases.ts`. */
const LEDGER_TYPES = ["refund", "dispute_loss", "adjustment"];

export async function loadCustomerPurchasesReport(
  period: ReportPeriodBounds,
): Promise<CustomerPurchasesReport> {
  const admin = supabaseAdmin();
  const { fromIso, toExclusiveIso } = period;

  const [orders, ledger, shopifyOrders, shopifyRefunds] = await Promise.all([
    readAll<OrderRow>((a, b) =>
      admin
        .from("orders")
        .select(ORDER_COLUMNS)
        .gte("paid_at", fromIso)
        .lt("paid_at", toExclusiveIso)
        .order("paid_at", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b),
    ),
    readAll<LedgerRow>((a, b) =>
      admin
        .from("order_payments")
        .select(LEDGER_COLUMNS)
        .in("type", LEDGER_TYPES)
        .gte("created_at", fromIso)
        .lt("created_at", toExclusiveIso)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(a, b),
    ),
    readAll<ShopifyOrderRow>((a, b) =>
      admin
        .from("shopify_orders")
        .select("shopify_order_id, name, paid_at, currency, total_price, financial_status")
        .gte("paid_at", fromIso)
        .lt("paid_at", toExclusiveIso)
        .order("paid_at", { ascending: true })
        .order("shopify_order_id", { ascending: true })
        .range(a, b),
    ),
    readAll<ShopifyRefundRow>((a, b) =>
      admin
        .from("shopify_order_refunds")
        .select("shopify_refund_id, amount, currency, refunded_at, order:shopify_orders(name)")
        .gte("refunded_at", fromIso)
        .lt("refunded_at", toExclusiveIso)
        .order("refunded_at", { ascending: true })
        .order("shopify_refund_id", { ascending: true })
        .range(a, b),
    ),
  ]);

  const platformSales: PlatformSaleFact[] = orders.map((o) => ({
    orderId: o.id,
    orderNumber: o.order_number,
    paidAt: o.paid_at,
    status: o.status,
    currency: o.currency ?? "SGD",
    subtotal: Number(o.subtotal),
    discount: Number(o.discount_amount),
    shipping: Number(o.shipping_amount),
    tax: Number(o.tax_amount),
    total: Number(o.total),
    paymentReference: o.payment_reference,
    customerName: customerNameOf(one(o.customer), o.shipping_address),
    saleType: saleTypeOf(o.items ?? []),
  }));

  const platformLedger: PlatformLedgerFact[] = ledger.map((l) => {
    const order = one(l.order);
    return {
      orderNumber: order?.order_number ?? "",
      type: l.type,
      amount: Number(l.amount),
      currency: l.currency ?? "SGD",
      createdAt: l.created_at,
      stripeObjectId: l.stripe_object_id,
      metadataKind: typeof l.metadata?.kind === "string" ? l.metadata.kind : null,
      customerName: customerNameOf(one(order?.customer), order?.shipping_address),
      saleType: saleTypeOf(order?.items ?? []),
      orderStatus: order?.status ?? "",
    };
  });

  const shopifySales: ShopifySaleFact[] = shopifyOrders.map((o) => ({
    shopifyOrderId: String(o.shopify_order_id),
    name: o.name,
    paidAt: o.paid_at,
    currency: o.currency ?? "SGD",
    totalPrice: Number(o.total_price),
    financialStatus: o.financial_status,
  }));

  const shopifyRefundFacts: ShopifyRefundFact[] = shopifyRefunds.map((r) => ({
    shopifyRefundId: String(r.shopify_refund_id),
    orderName: one(r.order)?.name ?? null,
    amount: Number(r.amount),
    currency: r.currency ?? "SGD",
    refundedAt: r.refunded_at,
  }));

  return buildCustomerPurchasesReport({
    period,
    generatedAt: new Date().toISOString(),
    platformSales,
    platformLedger,
    shopifySales,
    shopifyRefunds: shopifyRefundFacts,
  });
}
