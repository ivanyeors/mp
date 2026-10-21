/**
 * Which pillows and bolsters a Customer has bought, and what re-adjusting each
 * would cost today (ADR 0024).
 *
 * Purchases are the customer's own platform Orders — the only purchases the
 * platform can prove. A captured Result already appears as its Order's line
 * (`customization_snapshot.result_id`), and an uncaptured one is not a purchase,
 * so Results are never a second source. Shopify orders are not linked (owner,
 * 2026-10-13); those customers book as "not listed".
 *
 * Always scoped by the `customerId` the caller resolved from the session — never
 * an id from a request body.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  evaluateReadjustment,
  sgtDate,
  type ReadjustablePurchase,
  type ReadjustmentQuote,
} from "@/lib/readjustment/eligibility";
import {
  loadReadjustmentPolicy,
  loadServicePrices,
  type ReadjustmentPolicy,
} from "@/lib/pricing/service-prices";

/**
 * Orders that were never paid for, or whose money went back, hold nothing to
 * re-adjust. A counted Order is one with `paid_at` set and a status outside
 * this set; the review request (CRM slice 07) uses the same rule.
 */
export const NOT_A_PURCHASE: ReadonlySet<string> = new Set(["pending", "cancelled", "refunded", "payment_failed"]);

/** Complimentary bookings that use a free visit (cancelled / expired give it back). */
export const COMPLIMENTARY_USING_STATUSES = ["booked", "attended", "no_show"] as const;

export type OrderLineRow = {
  id: string;
  kind?: string | null;
  quantity: number;
  returned_quantity?: number | null;
  product_title: string;
  variant_title: string | null;
  image_url: string | null;
  customization_snapshot?: Record<string, unknown> | null;
  product_variants?: {
    option1?: string | null;
    price_key?: string | null;
    pillow_product_id?: number | null;
    products?: { product_type?: string | null } | null;
  } | null;
};

export type OrderRow = {
  id: string;
  order_number: string;
  paid_at: string | null;
  status: string;
  order_items?: OrderLineRow[] | null;
};

type PillowProduct = { size: string; kind: string };

export type LineClass = {
  productType: "pillow" | "bolster";
  tier: "basic" | "premium" | null;
  size: string | null;
  length: string | null;
};

const BOLSTER_LENGTHS = new Set(["short", "medium", "long"]);

function asTier(v: unknown): "basic" | "premium" | null {
  return v === "basic" || v === "premium" ? v : null;
}

/**
 * A pillow or bolster line, or null for anything else (an accessory, a Service fee).
 * Same precedence the courier path uses (lib/shipping/lines.ts): the variant's
 * product, then the customisation snapshot.
 */
export function classifyOrderLine(
  line: OrderLineRow,
  pillowById: ReadonlyMap<number, PillowProduct>,
): LineClass | null {
  if (line.kind === "service") return null;
  const snap = (line.customization_snapshot ?? {}) as Record<string, unknown>;

  // A Result order (authorize-then-capture): the build is in the snapshot.
  if (typeof snap.result_id === "string" && (snap.product_type === "pillow" || snap.product_type === "bolster")) {
    return {
      productType: snap.product_type,
      tier: snap.product_type === "pillow" ? asTier(snap.assigned_tier) : null,
      size: typeof snap.assigned_size === "string" ? snap.assigned_size : null,
      length: typeof snap.assigned_length === "string" ? snap.assigned_length : null,
    };
  }

  const variant = line.product_variants ?? null;
  const productType = variant?.products?.product_type ?? null;
  if (productType === "bolster") {
    const fromKey = variant?.price_key?.startsWith("product:bolster:")
      ? variant.price_key.slice("product:bolster:".length)
      : null;
    const fromOption = variant?.option1?.toLowerCase() ?? null;
    const length = [fromKey, fromOption].find((l) => l && BOLSTER_LENGTHS.has(l)) ?? null;
    return { productType: "bolster", tier: null, size: null, length };
  }

  // A shop pillow variant, or a legacy cart customisation carrying its product id.
  const pillowId =
    variant?.pillow_product_id ??
    (typeof snap.pillow_product_id === "number" ? snap.pillow_product_id : null);
  if (productType === "pillow" || pillowId != null) {
    const product = pillowId != null ? pillowById.get(pillowId) : undefined;
    return {
      productType: "pillow",
      tier: asTier(product?.kind),
      size: product?.size ?? null,
      length: null,
    };
  }
  return null;
}

export function purchaseLabel(c: LineClass): string {
  if (c.productType === "bolster") {
    return c.length ? `Mbolster · ${c.length.charAt(0).toUpperCase()}${c.length.slice(1)}` : "Mbolster";
  }
  const name = c.tier === "premium" ? "Premium Mpillow" : c.tier === "basic" ? "Basic Mpillow" : "Mpillow";
  return c.size ? `${name} · Size ${c.size}` : name;
}

export type ReadjustablePurchaseView = ReadjustablePurchase & {
  orderItemId: string;
  orderNumber: string;
  label: string;
  imageUrl: string | null;
  quote: ReadjustmentQuote;
};

/** Pure: orders → the picker's list, newest first, each with today's quote. */
export function buildPurchaseList(input: {
  orders: OrderRow[];
  pillowById: ReadonlyMap<number, PillowProduct>;
  usedSeqsByItem: ReadonlyMap<string, number[]>;
  policy: ReadjustmentPolicy;
  fee: number;
  today: string;
}): ReadjustablePurchaseView[] {
  const out: ReadjustablePurchaseView[] = [];
  const orders = [...input.orders]
    .filter((o) => o.paid_at && !NOT_A_PURCHASE.has(o.status))
    .sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? ""));
  for (const order of orders) {
    for (const line of order.order_items ?? []) {
      const c = classifyOrderLine(line, input.pillowById);
      if (!c) continue;
      const units = Math.max(0, line.quantity - (line.returned_quantity ?? 0));
      if (units === 0) continue;
      const purchase: ReadjustablePurchase = {
        source: "platform",
        orderItemId: line.id,
        productType: c.productType,
        tier: c.tier,
        paidAt: order.paid_at,
        units,
      };
      out.push({
        ...purchase,
        orderItemId: line.id,
        orderNumber: order.order_number,
        label: purchaseLabel(c),
        imageUrl: line.image_url,
        quote: evaluateReadjustment(
          purchase,
          input.usedSeqsByItem.get(line.id) ?? [],
          input.policy,
          input.fee,
          input.today,
        ),
      });
    }
  }
  return out;
}

export type ReadjustmentContext = {
  purchases: ReadjustablePurchaseView[];
  fee: number;
  policy: ReadjustmentPolicy;
  today: string;
};

/** The signed-in customer's readjustable purchases with today's quotes. */
export async function loadReadjustmentContext(
  admin: SupabaseClient,
  customerId: string,
  now: Date = new Date(),
): Promise<ReadjustmentContext> {
  const [ordersRes, bookingsRes, prices, policy] = await Promise.all([
    admin
      .from("orders")
      .select(
        "id, order_number, paid_at, status, order_items(id, kind, quantity, returned_quantity, product_title, variant_title, image_url, customization_snapshot, product_variants(option1, price_key, pillow_product_id, products(product_type)))",
      )
      .eq("customer_id", customerId)
      .not("paid_at", "is", null),
    admin
      .from("readjustment_bookings")
      .select("order_item_id, complimentary_seq")
      .eq("customer_id", customerId)
      .eq("complimentary", true)
      .in("status", [...COMPLIMENTARY_USING_STATUSES]),
    loadServicePrices(admin),
    loadReadjustmentPolicy(admin),
  ]);
  if (ordersRes.error) throw new Error(ordersRes.error.message);
  if (bookingsRes.error) throw new Error(bookingsRes.error.message);
  const orders = (ordersRes.data ?? []) as unknown as OrderRow[];

  const pillowIds = new Set<number>();
  for (const o of orders) {
    for (const l of o.order_items ?? []) {
      const id =
        l.product_variants?.pillow_product_id ??
        (typeof l.customization_snapshot?.pillow_product_id === "number"
          ? (l.customization_snapshot.pillow_product_id as number)
          : null);
      if (id != null) pillowIds.add(id);
    }
  }
  const pillowById = new Map<number, PillowProduct>();
  if (pillowIds.size > 0) {
    const { data, error } = await admin.from("pillow_products").select("id, size, kind").in("id", [...pillowIds]);
    if (error) throw new Error(error.message);
    for (const p of data ?? []) pillowById.set(Number(p.id), { size: String(p.size), kind: String(p.kind) });
  }

  const usedSeqsByItem = new Map<string, number[]>();
  for (const b of bookingsRes.data ?? []) {
    if (!b.order_item_id || b.complimentary_seq == null) continue;
    const list = usedSeqsByItem.get(b.order_item_id as string) ?? [];
    list.push(Number(b.complimentary_seq));
    usedSeqsByItem.set(b.order_item_id as string, list);
  }

  const today = sgtDate(now);
  const fee = prices.readjustment.msrp;
  return {
    purchases: buildPurchaseList({ orders, pillowById, usedSeqsByItem, policy, fee, today }),
    fee,
    policy,
    today,
  };
}
