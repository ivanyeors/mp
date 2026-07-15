/**
 * DB-only Analytics channel aggregates (ADR 0006).
 * Orders = paid_at + order_margins; Shopify = mirror nets by paid_at; All = union.
 * No Shopify Admin API on this path.
 */

import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { supabaseAdmin } from "@/lib/supabase/server";

export type AnalyticsChannel = "all" | "orders" | "shopify";

export type PlatformOrderFact = {
  paidAt: string | null;
  netRevenue: number;
  cogs: number;
  grossMargin: number;
};

export type ShopifyLineFact = {
  quantity: number;
  grossRevenue: number;
  totalCost: number | null;
  isOthers: boolean;
  /** Timeline / breakdown identity (pre-resolved by caller). */
  seriesId: string;
  seriesName: string;
  seriesCategory: string;
  kind: "part" | "product" | "others";
  itemId?: number | null;
  pillowKindSize?: string | null;
  pillowTemplateId?: number | null;
};

export type ShopifyOrderFact = {
  paidAt: string | null;
  amountRefunded: number;
  currency?: string | null;
  lines: ShopifyLineFact[];
};

export type ChannelSalesSummary = {
  net_revenue: number;
  cogs: number;
  gross_margin: number;
  margin_pct: number | null;
  order_count: number;
  currency: "SGD";
};

export type ChannelBreakdownRow = {
  id: string;
  name: string;
  category: string;
  units: number;
  revenue: number;
  cogs: number;
  isOthers: boolean;
};

export type TimelinePoint = { date: string; units: number; revenue: number };
export type TimelineSeries = {
  id: string;
  name: string;
  category: string;
  data: TimelinePoint[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function money(n: unknown): number {
  const v = typeof n === "number" ? n : Number.parseFloat(String(n ?? ""));
  return Number.isFinite(v) ? v : 0;
}

export function paidAtInRange(
  paidAt: string | null | undefined,
  from: Date,
  to: Date
): boolean {
  if (!paidAt) return false;
  const t = new Date(paidAt).getTime();
  if (Number.isNaN(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

/** Mirror order nets: line gross − amount_refunded; Others COGS counts as 0. */
export function shopifyOrderNets(order: ShopifyOrderFact): {
  netRevenue: number;
  cogs: number;
  grossMargin: number;
  units: number;
} {
  let gross = 0;
  let cogs = 0;
  let units = 0;
  for (const li of order.lines) {
    gross += money(li.grossRevenue);
    cogs += money(li.totalCost);
    units += Math.max(0, Math.floor(Number(li.quantity ?? 0)));
  }
  const netRevenue = round2(Math.max(0, gross - money(order.amountRefunded)));
  const cogsR = round2(cogs);
  return { netRevenue, cogs: cogsR, grossMargin: round2(netRevenue - cogsR), units };
}

function withMarginPct(s: Omit<ChannelSalesSummary, "margin_pct" | "currency">): ChannelSalesSummary {
  const productRevenue = s.gross_margin + s.cogs;
  return {
    ...s,
    currency: "SGD",
    margin_pct: productRevenue > 0 ? (s.gross_margin / productRevenue) * 100 : null,
  };
}

/** Pure aggregate — fixtures / checks call this; DB loader wraps it. */
export function aggregateChannelSales(input: {
  channel: AnalyticsChannel;
  from: Date;
  to: Date;
  platform: PlatformOrderFact[];
  shopify: ShopifyOrderFact[];
}): {
  summary: ChannelSalesSummary;
  breakdown: ChannelBreakdownRow[];
  platformSummary: ChannelSalesSummary;
  shopifySummary: ChannelSalesSummary;
} {
  const includeOrders = input.channel === "all" || input.channel === "orders";
  const includeShopify = input.channel === "all" || input.channel === "shopify";

  const platformPaid = includeOrders
    ? input.platform.filter((o) => paidAtInRange(o.paidAt, input.from, input.to))
    : [];
  const shopifyPaid = includeShopify
    ? input.shopify.filter((o) => paidAtInRange(o.paidAt, input.from, input.to))
    : [];

  let pNet = 0;
  let pCogs = 0;
  let pGm = 0;
  for (const o of platformPaid) {
    pNet += money(o.netRevenue);
    pCogs += money(o.cogs);
    pGm += money(o.grossMargin);
  }
  const platformSummary = withMarginPct({
    net_revenue: round2(pNet),
    cogs: round2(pCogs),
    gross_margin: round2(pGm),
    order_count: platformPaid.length,
  });

  let sNet = 0;
  let sCogs = 0;
  let sGm = 0;
  for (const o of shopifyPaid) {
    const n = shopifyOrderNets(o);
    sNet += n.netRevenue;
    sCogs += n.cogs;
    sGm += n.grossMargin;
  }
  const shopifySummary = withMarginPct({
    net_revenue: round2(sNet),
    cogs: round2(sCogs),
    gross_margin: round2(sGm),
    order_count: shopifyPaid.length,
  });

  const summary = withMarginPct({
    net_revenue: round2(platformSummary.net_revenue + shopifySummary.net_revenue),
    cogs: round2(platformSummary.cogs + shopifySummary.cogs),
    gross_margin: round2(platformSummary.gross_margin + shopifySummary.gross_margin),
    order_count: platformSummary.order_count + shopifySummary.order_count,
  });

  type Acc = { name: string; category: string; units: number; revenue: number; cogs: number; isOthers: boolean };
  const byId = new Map<string, Acc>();
  for (const o of shopifyPaid) {
    for (const li of o.lines) {
      const id = li.isOthers ? "others" : li.seriesId;
      const cur = byId.get(id) ?? {
        name: li.isOthers ? "Others" : li.seriesName,
        category: li.isOthers ? "others" : li.seriesCategory,
        units: 0,
        revenue: 0,
        cogs: 0,
        isOthers: !!li.isOthers,
      };
      cur.units += Math.max(0, Math.floor(Number(li.quantity ?? 0)));
      cur.revenue = round2(cur.revenue + money(li.grossRevenue));
      cur.cogs = round2(cur.cogs + money(li.totalCost));
      if (li.isOthers) cur.isOthers = true;
      byId.set(id, cur);
    }
  }

  const breakdown: ChannelBreakdownRow[] = Array.from(byId.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { summary, breakdown, platformSummary, shopifySummary };
}

function monthsInRange(from: Date, to: Date): Date[] {
  const start = startOfMonth(from);
  const end = startOfMonth(to);
  const acc: Date[] = [];
  for (let d = start; d <= end; d = addMonths(d, 1)) acc.push(d);
  return acc;
}

/** Monthly timeline + sold-unit maps from Shopify mirror facts (paid_at months). */
export function buildShopifyTimeline(input: {
  from: Date;
  to: Date;
  shopify: ShopifyOrderFact[];
}): {
  parts: TimelineSeries[];
  products: TimelineSeries[];
  currency: string | null;
  totals: {
    partUnitsByItemId: Record<string, number>;
    pillowUnitsByKindSize: Record<string, number>;
    pillowUnitsByTemplateId: Record<string, number>;
  };
} {
  const months = monthsInRange(input.from, input.to);
  const paid = input.shopify.filter((o) => paidAtInRange(o.paidAt, input.from, input.to));

  type Bucket = { units: number; revenue: number };
  const partsAgg = new Map<string, Map<string, Bucket>>();
  const productsAgg = new Map<string, { name: string; category: string; byMonth: Map<string, Bucket> }>();
  const partUnitsByItemId = new Map<number, number>();
  const pillowUnitsByKindSize = new Map<string, number>();
  const pillowUnitsByTemplateId = new Map<number, number>();

  for (const order of paid) {
    const mk = order.paidAt ? startOfMonth(new Date(order.paidAt)).toISOString() : null;
    if (!mk) continue;
    for (const li of order.lines) {
      const units = Math.max(0, Math.floor(Number(li.quantity ?? 0)));
      if (!units) continue;
      const revenue = money(li.grossRevenue);

      if (li.kind === "others" || li.isOthers) {
        const entry =
          productsAgg.get("others") ??
          { name: "Others", category: "others", byMonth: new Map<string, Bucket>() };
        const cur = entry.byMonth.get(mk) ?? { units: 0, revenue: 0 };
        cur.units += units;
        cur.revenue += revenue;
        entry.byMonth.set(mk, cur);
        productsAgg.set("others", entry);
        continue;
      }

      if (li.kind === "part") {
        const byMonth = partsAgg.get(li.seriesCategory) ?? new Map<string, Bucket>();
        const cur = byMonth.get(mk) ?? { units: 0, revenue: 0 };
        cur.units += units;
        cur.revenue += revenue;
        byMonth.set(mk, cur);
        partsAgg.set(li.seriesCategory, byMonth);
        if (li.itemId) {
          partUnitsByItemId.set(li.itemId, (partUnitsByItemId.get(li.itemId) ?? 0) + units);
        }
      } else {
        const entry =
          productsAgg.get(li.seriesId) ??
          { name: li.seriesName, category: li.seriesCategory, byMonth: new Map() };
        const cur = entry.byMonth.get(mk) ?? { units: 0, revenue: 0 };
        cur.units += units;
        cur.revenue += revenue;
        entry.byMonth.set(mk, cur);
        productsAgg.set(li.seriesId, entry);
        if (li.pillowKindSize) {
          pillowUnitsByKindSize.set(
            li.pillowKindSize,
            (pillowUnitsByKindSize.get(li.pillowKindSize) ?? 0) + units
          );
        }
        if (li.pillowTemplateId) {
          pillowUnitsByTemplateId.set(
            li.pillowTemplateId,
            (pillowUnitsByTemplateId.get(li.pillowTemplateId) ?? 0) + units
          );
        }
      }
    }
  }

  const fill = (byMonth: Map<string, Bucket>): TimelinePoint[] =>
    months.map((m) => {
      const k = startOfMonth(m).toISOString();
      const b = byMonth.get(k) ?? { units: 0, revenue: 0 };
      return { date: k, units: b.units, revenue: b.revenue };
    });

  const parts: TimelineSeries[] = Array.from(partsAgg.entries())
    .map(([category, byMonth]) => ({
      id: category,
      name: category,
      category,
      data: fill(byMonth),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const products: TimelineSeries[] = Array.from(productsAgg.entries())
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      category: entry.category,
      data: fill(entry.byMonth),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const toRec = (m: Map<string, number>) => {
    const out: Record<string, number> = {};
    m.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  };
  const toRecN = (m: Map<number, number>) => {
    const out: Record<string, number> = {};
    m.forEach((v, k) => {
      out[String(k)] = v;
    });
    return out;
  };

  return {
    parts,
    products,
    currency: paid.find((o) => o.currency)?.currency ?? "SGD",
    totals: {
      partUnitsByItemId: toRecN(partUnitsByItemId),
      pillowUnitsByKindSize: toRec(pillowUnitsByKindSize),
      pillowUnitsByTemplateId: toRecN(pillowUnitsByTemplateId),
    },
  };
}

type MappingRow = {
  shopify_variant_id: number | string;
  kind: "pillow" | "bolster" | "part";
  pillow_size: string | null;
  pillow_kind: "basic" | "premium" | null;
  bolster_variant: string | null;
  item_id: number | null;
  default_template_id?: number | null;
};

function lineFactFromMirror(
  row: {
    quantity: number;
    gross_revenue: unknown;
    total_cost: unknown;
    is_others: boolean;
    mapping_kind: string | null;
    shopify_variant_id: number | string | null;
  },
  mapping: MappingRow | undefined,
  itemCategoryById: Map<number, string>
): ShopifyLineFact {
  const qty = Math.max(0, Math.floor(Number(row.quantity ?? 0)));
  const grossRevenue = money(row.gross_revenue);
  const totalCost = row.total_cost == null ? null : money(row.total_cost);
  const isOthers = !!row.is_others;

  if (isOthers || !mapping) {
    return {
      quantity: qty,
      grossRevenue,
      totalCost,
      isOthers: true,
      seriesId: "others",
      seriesName: "Others",
      seriesCategory: "others",
      kind: "others",
    };
  }

  if (mapping.kind === "part") {
    const itemId = mapping.item_id ? Number(mapping.item_id) : null;
    const category = itemId ? itemCategoryById.get(itemId) ?? "other" : "other";
    return {
      quantity: qty,
      grossRevenue,
      totalCost,
      isOthers: false,
      seriesId: category,
      seriesName: category,
      seriesCategory: category,
      kind: "part",
      itemId,
    };
  }

  if (mapping.kind === "pillow" && mapping.pillow_size) {
    const pk = (mapping.pillow_kind ?? "basic") as "basic" | "premium";
    const seriesId = `pillow:${pk}:${mapping.pillow_size}`;
    const templateId = mapping.default_template_id ? Number(mapping.default_template_id) : null;
    return {
      quantity: qty,
      grossRevenue,
      totalCost,
      isOthers: false,
      seriesId,
      seriesName: `${pk === "premium" ? "Premium" : "Basic"} Pillow — ${mapping.pillow_size}`,
      seriesCategory: "pillow",
      kind: "product",
      pillowKindSize: `${pk}:${mapping.pillow_size}`,
      pillowTemplateId:
        templateId && Number.isFinite(templateId) && templateId > 0 ? templateId : null,
    };
  }

  if (mapping.kind === "bolster" && mapping.bolster_variant) {
    const v = mapping.bolster_variant;
    return {
      quantity: qty,
      grossRevenue,
      totalCost,
      isOthers: false,
      seriesId: `bolster:${v}`,
      seriesName: `${v.charAt(0).toUpperCase() + v.slice(1)} Bolster`,
      seriesCategory: "bolster",
      kind: "product",
    };
  }

  // Mapped but incomplete identity → Others bucket (revenue still counts).
  return {
    quantity: qty,
    grossRevenue,
    totalCost,
    isOthers: true,
    seriesId: "others",
    seriesName: "Others",
    seriesCategory: "others",
    kind: "others",
  };
}

async function loadPlatformFacts(from: Date, to: Date): Promise<PlatformOrderFact[]> {
  const admin = supabaseAdmin();
  const { data: paidOrders, error: paidErr } = await admin
    .from("orders")
    .select("id, paid_at")
    .not("paid_at", "is", null)
    .gte("paid_at", from.toISOString())
    .lte("paid_at", to.toISOString());
  if (paidErr) throw new Error(paidErr.message);
  if (!paidOrders?.length) return [];

  const paidAtById = new Map<string, string | null>();
  for (const r of paidOrders) {
    paidAtById.set(String(r.id), r.paid_at ?? null);
  }
  const ids = Array.from(paidAtById.keys());

  const { data: margins, error: mErr } = await admin
    .from("order_margins")
    .select("order_id, net_revenue, cogs, gross_margin")
    .in("order_id", ids);
  if (mErr) throw new Error(mErr.message);

  return (margins ?? []).map((row) => ({
    paidAt: paidAtById.get(String(row.order_id)) ?? null,
    netRevenue: money(row.net_revenue),
    cogs: money(row.cogs),
    grossMargin: money(row.gross_margin),
  }));
}

async function loadShopifyFacts(from: Date, to: Date): Promise<ShopifyOrderFact[]> {
  const admin = supabaseAdmin();
  const { data: orders, error: oErr } = await admin
    .from("shopify_orders")
    .select("shopify_order_id, paid_at, amount_refunded, currency")
    .not("paid_at", "is", null)
    .gte("paid_at", from.toISOString())
    .lte("paid_at", to.toISOString());
  if (oErr) throw new Error(oErr.message);
  if (!orders?.length) return [];

  const orderIds = orders.map((o) => Number(o.shopify_order_id));
  const { data: lines, error: lErr } = await admin
    .from("shopify_order_lines")
    .select(
      "shopify_order_id, shopify_variant_id, quantity, gross_revenue, total_cost, is_others, mapping_kind"
    )
    .in("shopify_order_id", orderIds);
  if (lErr) throw new Error(lErr.message);

  const variantIds = Array.from(
    new Set(
      (lines ?? [])
        .map((li) => Number(li.shopify_variant_id))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  );

  const mappingByVariantId = new Map<number, MappingRow>();
  if (variantIds.length) {
    const { data: maps, error: mapErr } = await admin
      .from("shopify_variant_mappings")
      .select(
        "shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,default_template_id"
      )
      .in("shopify_variant_id", variantIds);
    if (mapErr) throw new Error(mapErr.message);
    for (const row of (maps ?? []) as MappingRow[]) {
      mappingByVariantId.set(Number(row.shopify_variant_id), row);
    }
  }

  const partItemIds = Array.from(
    new Set(
      Array.from(mappingByVariantId.values())
        .filter((m) => m.kind === "part" && m.item_id)
        .map((m) => Number(m.item_id))
    )
  );
  const itemCategoryById = new Map<number, string>();
  if (partItemIds.length) {
    const { data: items, error: iErr } = await admin
      .from("items")
      .select("id,category")
      .in("id", partItemIds);
    if (iErr) throw new Error(iErr.message);
    for (const row of items ?? []) {
      const id = Number(row.id);
      if (Number.isFinite(id) && id > 0) itemCategoryById.set(id, String(row.category ?? "other"));
    }
  }

  const linesByOrder = new Map<number, ShopifyLineFact[]>();
  for (const li of lines ?? []) {
    const oid = Number(li.shopify_order_id);
    const vid = li.shopify_variant_id != null ? Number(li.shopify_variant_id) : null;
    const mapping = vid != null ? mappingByVariantId.get(vid) : undefined;
    const fact = lineFactFromMirror(
      {
        quantity: Number(li.quantity),
        gross_revenue: li.gross_revenue,
        total_cost: li.total_cost,
        is_others: !!li.is_others,
        mapping_kind: li.mapping_kind ?? null,
        shopify_variant_id: li.shopify_variant_id,
      },
      mapping,
      itemCategoryById
    );
    const list = linesByOrder.get(oid) ?? [];
    list.push(fact);
    linesByOrder.set(oid, list);
  }

  return orders.map((o) => ({
    paidAt: o.paid_at ?? null,
    amountRefunded: money(o.amount_refunded),
    currency: o.currency ?? "SGD",
    lines: linesByOrder.get(Number(o.shopify_order_id)) ?? [],
  }));
}

export async function getChannelSalesSummary(input: {
  channel: AnalyticsChannel;
  from: string;
  to: string;
}): Promise<{
  ok: true;
  summary: ChannelSalesSummary;
  breakdown: ChannelBreakdownRow[];
  platformSummary: ChannelSalesSummary;
  shopifySummary: ChannelSalesSummary;
  timeline: ReturnType<typeof buildShopifyTimeline>;
}> {
  const from = startOfMonth(new Date(input.from));
  const to = endOfMonth(new Date(input.to));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid date range");
  }

  const includeOrders = input.channel === "all" || input.channel === "orders";
  const includeShopify = input.channel === "all" || input.channel === "shopify";

  const [platform, shopify] = await Promise.all([
    includeOrders ? loadPlatformFacts(from, to) : Promise.resolve([] as PlatformOrderFact[]),
    includeShopify ? loadShopifyFacts(from, to) : Promise.resolve([] as ShopifyOrderFact[]),
  ]);

  const agg = aggregateChannelSales({
    channel: input.channel,
    from,
    to,
    platform,
    shopify,
  });

  // Timeline always from the shopify facts included for this channel (empty when orders-only).
  const timeline = buildShopifyTimeline({ from, to, shopify });

  return { ok: true as const, ...agg, timeline };
}
