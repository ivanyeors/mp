/**
 * DB-only Analytics channel facts (ADR 0006), loaded into sold lines.
 *
 * Orders = paid platform Orders (`paid_at`) with `order_margins` and their
 * `order_items` costs; Shopify = the order mirror; All = both. No Shopify Admin
 * API on this path. Months are Singapore months (`sg-calendar.ts`), and every
 * read pages, so a range past 1,000 rows reports on all of them.
 */

import { supabaseAdmin } from "@/lib/supabase/server";
import { selectAll, selectAllIn } from "@/lib/supabase/select-all";
import {
  loadShopifyMirrorCostingsContext,
  shopifyMappingBuildLines,
  shopifyMappingUncostedItemIds,
} from "@/lib/shopify/order-mirror-ingest";
import { sgMonthRange, type SgMonthRange } from "./sg-calendar";
import { buildSalesReport, type CostGapFix, type SalesReport, type SoldLine, type SoldOrder } from "./sold-lines";

export type AnalyticsChannel = "all" | "orders" | "shopify";

type AdminClient = ReturnType<typeof supabaseAdmin>;

function money(n: unknown): number {
  const v = typeof n === "number" ? n : Number.parseFloat(String(n ?? ""));
  return Number.isFinite(v) ? v : 0;
}

function moneyOrNull(n: unknown): number | null {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

const LENGTHS = new Set(["short", "medium", "long"]);

function lengthLabel(length: string): string {
  return length.charAt(0).toUpperCase() + length.slice(1);
}

function itemLabel(item: { name: string | null; size: string | null } | undefined, fallback: string): string {
  if (!item?.name) return fallback;
  return item.size ? `${item.name} (${item.size})` : item.name;
}

type ItemRow = { id: number; name: string | null; size: string | null; category: string | null };

async function loadItems(admin: AdminClient, ids: number[]): Promise<Map<number, ItemRow>> {
  const rows = await selectAllIn(ids, (chunk) =>
    admin.from("items").select("id,name,size,category").in("id", chunk).order("id"),
  );
  return new Map((rows as ItemRow[]).map((r) => [Number(r.id), r]));
}

// ── Platform Orders ─────────────────────────────────────────────────────────

type PlatformItemRow = {
  id: string;
  order_id: string;
  variant_id: string | null;
  kind: string | null;
  service_key: string | null;
  product_title: string | null;
  quantity: number;
  total_price: number | string | null;
  unit_cost: number | string | null;
  total_cost: number | string | null;
  returned_quantity: number | null;
  snap_type: string | null;
  snap_result: string | null;
  snap_size: string | null;
  snap_tier: string | null;
  snap_length: string | null;
  snap_bolster: string | null;
};

type VariantRow = {
  id: string;
  item_id: number | null;
  pillow_product_id: number | null;
  option1: string | null;
  products: { product_type: string | null } | { product_type: string | null }[] | null;
};

async function loadPlatformSoldOrders(admin: AdminClient, range: SgMonthRange): Promise<SoldOrder[]> {
  const orders = (await selectAll(() =>
    admin
      .from("orders")
      .select("id,paid_at")
      .not("paid_at", "is", null)
      .gte("paid_at", range.from.toISOString())
      .lt("paid_at", range.toExclusive.toISOString())
      .order("id"),
  )) as Array<{ id: string; paid_at: string }>;
  if (!orders.length) return [];
  const ids = orders.map((o) => String(o.id));

  const [margins, items] = await Promise.all([
    selectAllIn(ids, (chunk) =>
      admin.from("order_margins").select("order_id,cogs,gross_margin").in("order_id", chunk).order("order_id"),
    ) as Promise<Array<{ order_id: string; cogs: unknown; gross_margin: unknown }>>,
    selectAllIn(ids, (chunk) =>
      admin
        .from("order_items")
        .select(
          "id,order_id,variant_id,kind,service_key,product_title,quantity,total_price,unit_cost,total_cost,returned_quantity," +
            "snap_type:customization_snapshot->>product_type,snap_result:customization_snapshot->>result_id," +
            "snap_size:customization_snapshot->>assigned_size,snap_tier:customization_snapshot->>assigned_tier," +
            "snap_length:customization_snapshot->>assigned_length,snap_bolster:customization_snapshot->>bolster_variant",
        )
        .in("order_id", chunk)
        .order("id"),
    ) as unknown as Promise<PlatformItemRow[]>,
  ]);

  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((v): v is string => !!v))];
  const [variants, pillowProducts] = await Promise.all([
    selectAllIn(variantIds, (chunk) =>
      admin
        .from("product_variants")
        .select("id,item_id,pillow_product_id,option1,products(product_type)")
        .in("id", chunk)
        .order("id"),
    ) as unknown as Promise<VariantRow[]>,
    selectAll(() => admin.from("pillow_products").select("id,kind,size").order("id")) as Promise<
      Array<{ id: number; kind: string | null; size: string | null }>
    >,
  ]);
  const variantById = new Map(variants.map((v) => [String(v.id), v]));
  const pillowById = new Map(pillowProducts.map((p) => [Number(p.id), p]));
  const itemById = await loadItems(
    admin,
    variants.map((v) => v.item_id).filter((id): id is number => id != null).map(Number),
  );

  const marginByOrder = new Map(margins.map((m) => [String(m.order_id), m]));
  const linesByOrder = new Map<string, SoldLine[]>();

  for (const row of items) {
    const title = row.product_title || "Untitled line";
    const units = Math.max(0, Math.floor(Number(row.quantity ?? 0)));
    const gross = money(row.total_price);
    const totalCost = moneyOrNull(row.total_cost);
    // Restocked returns come back out of COGS, as `order_margins` takes them.
    const restocked = (moneyOrNull(row.unit_cost) ?? 0) * Math.max(0, Number(row.returned_quantity ?? 0));
    let cost: number | null = totalCost == null ? null : Math.max(0, totalCost - restocked);
    let line: Omit<SoldLine, "units" | "gross" | "cost">;

    if (row.kind === "service") {
      // A Service takes no stock; its cost is what Costings → Service fees
      // recorded at sale, and none when that is blank.
      cost = cost ?? 0;
      line = { group: "service", key: `service:${row.service_key ?? "other"}`, label: title };
    } else {
      const variant = row.variant_id ? variantById.get(String(row.variant_id)) : undefined;
      const productType = variant
        ? (Array.isArray(variant.products) ? variant.products[0] : variant.products)?.product_type
        : null;
      const pillow = variant?.pillow_product_id != null ? pillowById.get(Number(variant.pillow_product_id)) : undefined;
      const length = (row.snap_length ?? row.snap_bolster ?? variant?.option1 ?? "").toLowerCase();

      if (pillow?.size) {
        const tier = pillow.kind === "premium" ? "premium" : "basic";
        line = { group: "pillow", key: `pillow:${tier}:${pillow.size}`, label: `Size ${pillow.size}` };
      } else if (!variant && row.snap_result && row.snap_type === "pillow" && row.snap_size) {
        const tier = row.snap_tier === "premium" ? "premium" : "basic";
        line = { group: "pillow", key: `pillow:${tier}:${row.snap_size}`, label: `Size ${row.snap_size}` };
      } else if ((productType === "bolster" || row.snap_type === "bolster") && LENGTHS.has(length)) {
        line = { group: "bolster", key: `bolster:${length}`, label: lengthLabel(length) };
      } else if (variant?.item_id != null) {
        const item = itemById.get(Number(variant.item_id));
        line = {
          group: "part",
          key: `item:${variant.item_id}`,
          label: itemLabel(item, title),
          category: item?.category ?? "other",
        };
      } else {
        line = { group: "unmapped", key: `unmapped:${title}`, label: title };
      }
    }

    const list = linesByOrder.get(String(row.order_id)) ?? [];
    list.push({
      ...line,
      units,
      gross,
      cost,
      uncostedReason: cost == null ? "No cost was recorded on the order line when it sold." : null,
    });
    linesByOrder.set(String(row.order_id), list);
  }

  return orders.map((o) => {
    const m = marginByOrder.get(String(o.id));
    // `order_margins`: product revenue after discount, scaled by refunds = margin + COGS.
    const productRevenue = m ? money(m.gross_margin) + money(m.cogs) : 0;
    return {
      channel: "orders" as const,
      paidAt: o.paid_at,
      productRevenue,
      lines: linesByOrder.get(String(o.id)) ?? [],
    };
  });
}

// ── Shopify order mirror ────────────────────────────────────────────────────

type MirrorLine = {
  shopify_line_item_id: number;
  shopify_order_id: number;
  shopify_variant_id: number | null;
  title: string | null;
  quantity: number;
  gross_revenue: unknown;
  total_cost: unknown;
  is_others: boolean;
};

async function loadShopifySoldOrders(admin: AdminClient, range: SgMonthRange): Promise<SoldOrder[]> {
  const orders = (await selectAll(() =>
    admin
      .from("shopify_orders")
      .select("shopify_order_id,paid_at,total_price,amount_refunded")
      .not("paid_at", "is", null)
      .gte("paid_at", range.from.toISOString())
      .lt("paid_at", range.toExclusive.toISOString())
      .order("shopify_order_id"),
  )) as Array<{ shopify_order_id: number; paid_at: string; total_price: unknown; amount_refunded: unknown }>;
  if (!orders.length) return [];

  const lines = (await selectAllIn(
    orders.map((o) => Number(o.shopify_order_id)),
    (chunk) =>
      admin
        .from("shopify_order_lines")
        .select("shopify_line_item_id,shopify_order_id,shopify_variant_id,title,quantity,gross_revenue,total_cost,is_others")
        .in("shopify_order_id", chunk)
        .order("shopify_line_item_id"),
  )) as MirrorLine[];

  // The same Costings context the mirror is costed with, so a gap's reason is
  // the reason the ingest could not cost it.
  const ctx = await loadShopifyMirrorCostingsContext(
    admin,
    lines.map((l) => Number(l.shopify_variant_id)).filter((v) => Number.isFinite(v) && v > 0),
  );
  const uncostedByVariant = new Map<number, number[]>();
  const itemIds = new Set<number>();
  for (const m of ctx.mappingsByVariantId.values()) {
    if (m.kind === "part" && m.item_id != null) itemIds.add(m.item_id);
    const missing = shopifyMappingUncostedItemIds(m, ctx);
    uncostedByVariant.set(m.shopify_variant_id, missing);
    missing.forEach((id) => itemIds.add(id));
  }
  const itemById = await loadItems(admin, [...itemIds]);

  const linesByOrder = new Map<number, SoldLine[]>();
  for (const li of lines) {
    const title = li.title || "Untitled line";
    const variantId = li.shopify_variant_id != null ? Number(li.shopify_variant_id) : null;
    const mapping = variantId != null ? ctx.mappingsByVariantId.get(variantId) : undefined;
    const totalCost = moneyOrNull(li.total_cost);
    const cost = !li.is_others && totalCost != null ? totalCost : null;

    let line: Omit<SoldLine, "units" | "gross" | "cost">;
    if (mapping?.kind === "part" && mapping.item_id != null) {
      const item = itemById.get(mapping.item_id);
      line = {
        group: "part",
        key: `item:${mapping.item_id}`,
        label: itemLabel(item, title),
        category: item?.category ?? "other",
      };
    } else if (mapping?.kind === "pillow" && mapping.pillow_size) {
      const tier = mapping.pillow_kind === "premium" ? "premium" : "basic";
      line = { group: "pillow", key: `pillow:${tier}:${mapping.pillow_size}`, label: `Size ${mapping.pillow_size}` };
    } else if (mapping?.kind === "bolster" && mapping.bolster_variant && LENGTHS.has(mapping.bolster_variant)) {
      line = { group: "bolster", key: `bolster:${mapping.bolster_variant}`, label: lengthLabel(mapping.bolster_variant) };
    } else {
      line = { group: "unmapped", key: `unmapped:${title}`, label: title };
    }

    let uncostedReason: string | null = null;
    let uncostedFix: CostGapFix | null = null;
    if (cost == null) {
      const missing = variantId != null ? (uncostedByVariant.get(variantId) ?? []) : [];
      if (!mapping || line.group === "unmapped") {
        uncostedReason = "Not mapped to an inventory product, so it has no build to cost.";
        uncostedFix = variantId != null ? "mapping" : null;
      } else if (missing.length) {
        const names = missing.map((id) => itemLabel(itemById.get(id), `Item ${id}`));
        uncostedReason = `No cost price in Costings for ${names.join(", ")}.`;
        uncostedFix = "costings";
      } else if (!shopifyMappingBuildLines(mapping, ctx)?.length) {
        uncostedReason = "Its product has no recipe in Configure to cost.";
        uncostedFix = "configure";
      } else {
        uncostedReason = "Costings can cost it now; it is re-costed the next time Costings is saved.";
        uncostedFix = "costings";
      }
    }

    const list = linesByOrder.get(Number(li.shopify_order_id)) ?? [];
    list.push({
      ...line,
      units: Math.max(0, Math.floor(Number(li.quantity ?? 0))),
      gross: money(li.gross_revenue),
      cost,
      uncostedReason,
      uncostedFix,
    });
    linesByOrder.set(Number(li.shopify_order_id), list);
  }

  return orders.map((o) => {
    const orderLines = linesByOrder.get(Number(o.shopify_order_id)) ?? [];
    const listed = orderLines.reduce((sum, l) => sum + l.gross, 0);
    // The mirror keeps line list prices, not Shopify's discounts. What the
    // customer paid caps the goods revenue, so a discounted order is not
    // reported at list price; shipping and tax only ever raise `total_price`.
    const paid = money(o.total_price);
    const goods = paid > 0 ? Math.min(listed, paid) : listed;
    return {
      channel: "shopify" as const,
      paidAt: o.paid_at,
      productRevenue: Math.max(0, goods - money(o.amount_refunded)),
      lines: orderLines,
    };
  });
}

export async function loadSalesReport(input: {
  channel: AnalyticsChannel;
  from: string;
  to: string;
}): Promise<SalesReport & { fromMonth: string; toMonth: string }> {
  const range = sgMonthRange(input.from, input.to);
  const admin = supabaseAdmin();
  const includeOrders = input.channel === "all" || input.channel === "orders";
  const includeShopify = input.channel === "all" || input.channel === "shopify";

  const [platform, shopify] = await Promise.all([
    includeOrders ? loadPlatformSoldOrders(admin, range) : Promise.resolve([]),
    includeShopify ? loadShopifySoldOrders(admin, range) : Promise.resolve([]),
  ]);

  return {
    ...buildSalesReport({ orders: [...platform, ...shopify], months: range.months }),
    fromMonth: range.fromMonth,
    toMonth: range.toMonth,
  };
}
