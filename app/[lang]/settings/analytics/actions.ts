"use server";

import { supabaseAdmin } from "@/lib/supabase/server";
import { shopifyListPaidOrdersPaginated, type ShopifyOrderLite } from "@/lib/shopify/orders";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";

export type SalesMetric = "units" | "revenue";
export type TimelineViewMode = "parts" | "products";

export type TimelinePoint = {
  date: string; // ISO for month start
  units: number;
  revenue: number; // store currency units
};

export type TimelineSeries = {
  id: string;
  name: string;
  category: string;
  data: TimelinePoint[];
};

type VariantMappingRow = {
  shopify_variant_id: number | string;
  kind: "pillow" | "bolster" | "part";
  pillow_size: "XS" | "S" | "M" | "L" | "XL" | null;
  pillow_kind: "basic" | "premium" | null;
  bolster_variant: "short" | "medium" | "long" | null;
  item_id: number | null;
  default_template_id?: number | null;
};

type ItemCategoryRow = { id: number | string; category: string | null };

function monthsInRange(from: Date, to: Date): Date[] {
  const start = startOfMonth(from);
  const end = startOfMonth(to);
  const acc: Date[] = [];
  for (let d = start; d <= end; d = addMonths(d, 1)) acc.push(d);
  return acc;
}

function toMoneyNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

export async function getShopifySalesTimeline(input: { from: string; to: string }) {
  const from = startOfMonth(new Date(input.from));
  const to = endOfMonth(new Date(input.to));
  const months = monthsInRange(from, to);

  const orders: ShopifyOrderLite[] = await shopifyListPaidOrdersPaginated({
    createdAtMin: from.toISOString(),
    createdAtMax: to.toISOString(),
    pageSize: 250,
    maxPages: 10,
  });

  const variantIds = Array.from(
    new Set(
      orders
        .flatMap((o) => o.line_items ?? [])
        .map((li) => li.variant_id)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    )
  );

  const admin = supabaseAdmin();
  const mappingByVariantId = new Map<number, VariantMappingRow>();
  if (variantIds.length) {
    const { data, error } = await admin
      .from("shopify_variant_mappings")
      .select("shopify_variant_id,kind,pillow_size,pillow_kind,bolster_variant,item_id,default_template_id")
      .in("shopify_variant_id", variantIds);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((row: VariantMappingRow) => {
      mappingByVariantId.set(Number(row.shopify_variant_id), row);
    });
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
    const { data, error } = await admin.from("items").select("id,category").in("id", partItemIds);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((row: ItemCategoryRow) => {
      const id = Number(row.id);
      if (!Number.isFinite(id) || id <= 0) return;
      itemCategoryById.set(id, String(row.category ?? "other"));
    });
  }

  type Bucket = { units: number; revenue: number };
  const partsAgg = new Map<string, Map<string, Bucket>>(); // category -> monthISO -> bucket
  const productsAgg = new Map<string, { name: string; category: string; byMonth: Map<string, Bucket> }>();
  const partUnitsByItemId = new Map<number, number>();
  const pillowUnitsByKindSize = new Map<string, number>(); // key: basic:S
  const pillowUnitsByTemplateId = new Map<number, number>(); // bom_templates.id

  const monthKeyForOrder = (createdAt: string | null | undefined): string | null => {
    if (!createdAt) return null;
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return null;
    return startOfMonth(d).toISOString();
  };

  for (const order of orders) {
    const mk = monthKeyForOrder(order.created_at ?? null);
    if (!mk) continue;
    for (const li of order.line_items ?? []) {
      const variantId = li.variant_id ?? null;
      if (!variantId) continue;
      const mapping = mappingByVariantId.get(Number(variantId));
      if (!mapping) continue;

      const units = Math.max(0, Math.floor(Number(li.quantity ?? 0)));
      if (!units) continue;

      const unitPrice = toMoneyNumber((li as ShopifyOrderLite["line_items"][number]).price);
      const revenue = Math.max(0, unitPrice * units);

      if (mapping.kind === "part") {
        const itemId = mapping.item_id ? Number(mapping.item_id) : null;
        const category = itemId ? itemCategoryById.get(itemId) ?? "other" : "other";
        const byMonth = partsAgg.get(category) ?? new Map<string, Bucket>();
        const cur = byMonth.get(mk) ?? { units: 0, revenue: 0 };
        cur.units += units;
        cur.revenue += revenue;
        byMonth.set(mk, cur);
        partsAgg.set(category, byMonth);

        if (itemId) {
          partUnitsByItemId.set(itemId, (partUnitsByItemId.get(itemId) ?? 0) + units);
        }
      } else if (mapping.kind === "pillow" && mapping.pillow_size) {
        const pk = (mapping.pillow_kind ?? "basic") as "basic" | "premium";
        const key = `pillow:${pk}:${mapping.pillow_size}`;
        const name = `${pk === "premium" ? "Premium" : "Basic"} Pillow — ${mapping.pillow_size}`;
        const entry = productsAgg.get(key) ?? { name, category: "pillow", byMonth: new Map<string, Bucket>() };
        const cur = entry.byMonth.get(mk) ?? { units: 0, revenue: 0 };
        cur.units += units;
        cur.revenue += revenue;
        entry.byMonth.set(mk, cur);
        productsAgg.set(key, entry);

        const ksKey = `${pk}:${mapping.pillow_size}`;
        pillowUnitsByKindSize.set(ksKey, (pillowUnitsByKindSize.get(ksKey) ?? 0) + units);
        const templateId = mapping.default_template_id ? Number(mapping.default_template_id) : null;
        if (templateId && Number.isFinite(templateId) && templateId > 0) {
          pillowUnitsByTemplateId.set(templateId, (pillowUnitsByTemplateId.get(templateId) ?? 0) + units);
        }
      } else if (mapping.kind === "bolster" && mapping.bolster_variant) {
        const key = `bolster:${mapping.bolster_variant}`;
        const name = `${mapping.bolster_variant.charAt(0).toUpperCase() + mapping.bolster_variant.slice(1)} Bolster`;
        const entry = productsAgg.get(key) ?? { name, category: "bolster", byMonth: new Map<string, Bucket>() };
        const cur = entry.byMonth.get(mk) ?? { units: 0, revenue: 0 };
        cur.units += units;
        cur.revenue += revenue;
        entry.byMonth.set(mk, cur);
        productsAgg.set(key, entry);
      }
    }
  }

  const parts: TimelineSeries[] = Array.from(partsAgg.entries()).map(([category, byMonth]) => ({
    id: category,
    name: category,
    category,
    data: months.map((m) => {
      const k = startOfMonth(m).toISOString();
      const b = byMonth.get(k) ?? { units: 0, revenue: 0 };
      return { date: k, units: b.units, revenue: b.revenue };
    }),
  }));

  const products: TimelineSeries[] = Array.from(productsAgg.entries()).map(([id, entry]) => ({
    id,
    name: entry.name,
    category: entry.category,
    data: months.map((m) => {
      const k = startOfMonth(m).toISOString();
      const b = entry.byMonth.get(k) ?? { units: 0, revenue: 0 };
      return { date: k, units: b.units, revenue: b.revenue };
    }),
  }));

  // Sort to keep stable output
  parts.sort((a, b) => a.name.localeCompare(b.name));
  products.sort((a, b) => a.name.localeCompare(b.name));

  const toRecordNumber = (m: Map<string, number>) => {
    const out: Record<string, number> = {};
    m.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  };
  const toRecordNumberKey = (m: Map<number, number>) => {
    const out: Record<string, number> = {};
    m.forEach((v, k) => {
      out[String(k)] = v;
    });
    return out;
  };

  return {
    ok: true as const,
    parts,
    products,
    currency: orders.find((o) => o.currency)?.currency ?? null,
    totals: {
      partUnitsByItemId: toRecordNumberKey(partUnitsByItemId),
      pillowUnitsByKindSize: toRecordNumber(pillowUnitsByKindSize),
      pillowUnitsByTemplateId: toRecordNumberKey(pillowUnitsByTemplateId),
    },
  };
}

export type MonthlyInventoryRow = {
  month: string; // ISO month start
  totalsByCategory: Record<string, number>;
};

export async function getMonthlyInventoryByCategory(input: { from: string; to: string }) {
  const from = startOfMonth(new Date(input.from));
  const to = endOfMonth(new Date(input.to));
  const months = monthsInRange(from, to);

  const admin = supabaseAdmin();

  const { data: itemRows, error: itemErr } = await admin.from("items").select("id,category");
  if (itemErr) throw new Error(itemErr.message);
  const itemCategoryById = new Map<number, string>();
  (itemRows ?? []).forEach((r: ItemCategoryRow) => {
    const id = Number(r.id);
    if (!Number.isFinite(id) || id <= 0) return;
    itemCategoryById.set(id, String(r.category ?? "other"));
  });

  // Fetch all transactions up to end of range so month-end snapshots are correct.
  const { data: txRows, error: txErr } = await admin
    .from("inventory_transactions")
    .select("item_id,quantity_signed,created_at")
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: true });
  if (txErr) throw new Error(txErr.message);

  type TxRow = { item_id: number | string; quantity_signed: number | string; created_at: string };
  const txs = (txRows ?? []) as TxRow[];

  const categories = new Set<string>();
  itemCategoryById.forEach((cat) => categories.add(cat));

  const runningByCategory = new Map<string, number>();
  categories.forEach((c) => runningByCategory.set(c, 0));

  const results: MonthlyInventoryRow[] = [];

  let txIdx = 0;
  for (const monthStart of months) {
    const monthEnd = endOfMonth(monthStart);

    for (; txIdx < txs.length; txIdx += 1) {
      const tx = txs[txIdx];
      const createdAt = new Date(tx.created_at);
      if (createdAt > monthEnd) break;

      const itemId = Number(tx.item_id);
      if (!Number.isFinite(itemId) || itemId <= 0) continue;
      const cat = itemCategoryById.get(itemId) ?? "other";
      const delta = Number(tx.quantity_signed);
      if (!Number.isFinite(delta) || delta === 0) continue;
      runningByCategory.set(cat, (runningByCategory.get(cat) ?? 0) + delta);
    }

    const totalsByCategory: Record<string, number> = {};
    Array.from(runningByCategory.entries()).forEach(([cat, value]) => {
      totalsByCategory[cat] = Math.max(0, Math.round(value));
    });

    results.push({ month: startOfMonth(monthStart).toISOString(), totalsByCategory });
  }

  return { ok: true as const, rows: results, categories: Array.from(categories).sort() };
}

export type InventoryMovementGroup = "category" | "size" | "type";

export type InventoryMovementRow = {
  key: string;
  label: string;
  kind?: "total_start" | "total_end" | "delta";
  stockIn: number;
  stockOut: number;
  net: number;
  startQty: number;
  endQty: number;
};

export type MpConfigMetricKey =
  | "gender"
  | "ageGroup"
  | "bloodPressureLevel"
  | "earDiscomfortSideSleep"
  | "bedFirmness"
  | "acidReflux";

export type MpConfigMetricSegment = {
  key: string;
  label: string;
  count: number;
};

export type MpConfigMetricBreakdown = {
  key: MpConfigMetricKey;
  label: string;
  total: number;
  segments: MpConfigMetricSegment[];
};

export async function getMpConfigMetricsBreakdown(input: { from: string; to: string }) {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid date range");
  }

  const admin = supabaseAdmin();
  const { data: rows, error } = await admin
    .from("mp_config_responses")
    .select("data")
    .eq("is_final", true)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
  if (error) throw new Error(error.message);

  type MetricConfig = {
    key: MpConfigMetricKey;
    label: string;
    allowed: Array<{ key: string; label: string }>;
  };

  const configs: MetricConfig[] = [
    {
      key: "gender",
      label: "Gender",
      allowed: [
        { key: "female", label: "Female" },
        { key: "male", label: "Male" },
      ],
    },
    {
      key: "ageGroup",
      label: "Age group",
      allowed: [
        { key: "under-18", label: "Under 18" },
        { key: "18-24", label: "18–24" },
        { key: "25-34", label: "25–34" },
        { key: "35-44", label: "35–44" },
        { key: "45-54", label: "45–54" },
        { key: "55-64", label: "55–64" },
        { key: "65-plus", label: "65+" },
      ],
    },
    {
      key: "bloodPressureLevel",
      label: "Blood pressure",
      allowed: [
        { key: "normal", label: "Normal" },
        { key: "low-blood", label: "Low Blood" },
        { key: "high-blood", label: "High Blood" },
        { key: "unsure", label: "Unsure" },
      ],
    },
    {
      key: "earDiscomfortSideSleep",
      label: "Ear discomfort",
      allowed: [
        { key: "yes", label: "Yes" },
        { key: "no", label: "No" },
      ],
    },
    {
      key: "bedFirmness",
      label: "Bed firmness",
      allowed: [
        { key: "soft", label: "Soft" },
        { key: "medium-soft", label: "Medium Soft" },
        { key: "firm", label: "Firm" },
      ],
    },
    {
      key: "acidReflux",
      label: "Acid reflux",
      allowed: [
        { key: "yes", label: "Yes" },
        { key: "no", label: "No" },
      ],
    },
  ];

  const countsByMetricKey = new Map<MpConfigMetricKey, Map<string, number>>();
  for (const cfg of configs) {
    const m = new Map<string, number>();
    cfg.allowed.forEach((opt) => m.set(opt.key, 0));
    countsByMetricKey.set(cfg.key, m);
  }

  const responseRows = (rows ?? []) as Array<{ data?: unknown }>;
  for (const r of responseRows) {
    const data = (r?.data ?? {}) as Record<string, unknown>;
    for (const cfg of configs) {
      const raw = data[cfg.key];
      if (typeof raw !== "string") continue;
      const v = raw.trim();
      if (!v) continue;
      const metricCounts = countsByMetricKey.get(cfg.key);
      if (!metricCounts) continue;
      if (!metricCounts.has(v)) continue; // ignore unexpected values
      metricCounts.set(v, (metricCounts.get(v) ?? 0) + 1);
    }
  }

  const metrics: MpConfigMetricBreakdown[] = configs.map((cfg) => {
    const metricCounts = countsByMetricKey.get(cfg.key) ?? new Map<string, number>();
    const segments = cfg.allowed.map((opt) => ({
      key: opt.key,
      label: opt.label,
      count: metricCounts.get(opt.key) ?? 0,
    }));
    const total = segments.reduce((sum, s) => sum + s.count, 0);
    return { key: cfg.key, label: cfg.label, total, segments };
  });

  return { ok: true as const, metrics };
}

export async function getInventoryMovementWaterfall(input: {
  from: string;
  to: string;
  group: InventoryMovementGroup;
  category?: string | null;
  size?: string | null;
}) {
  const start = new Date(input.from);
  const end = new Date(input.to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid date range");
  }

  const admin = supabaseAdmin();

  const { data: txRows, error: txErr } = await admin
    .from("inventory_transactions")
    .select("item_id,quantity_signed,created_at")
    // We need txns before start as well to compute startQty.
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: true });
  if (txErr) throw new Error(txErr.message);

  type TxRow = { item_id: number | string; quantity_signed: number | string; created_at: string };
  const txs = (txRows ?? []) as TxRow[];

  const itemIds = Array.from(
    new Set(
      txs
        .map((t) => Number(t.item_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  type ItemRow = { id: number | string; category: string | null; size: string | null; subtype: string | null; name: string | null };
  const itemById = new Map<number, ItemRow>();
  if (itemIds.length) {
    const { data, error } = await admin.from("items").select("id,category,size,subtype,name").in("id", itemIds);
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r: ItemRow) => {
      const id = Number(r.id);
      if (!Number.isFinite(id) || id <= 0) return;
      itemById.set(id, r);
    });
  }

  const requestedCategory = input.category ? String(input.category) : null;
  const requestedSize = input.size ? String(input.size) : null;

  const groupKeyForItem = (it: ItemRow): { key: string; label: string } | null => {
    const category = String(it.category ?? "other");
    const size = it.size ? String(it.size) : null;
    const subtype = it.subtype ? String(it.subtype) : null;
    const name = it.name ? String(it.name) : null;

    if (input.group === "category") {
      return { key: category, label: category };
    }

    if (input.group === "size") {
      if (!requestedCategory) return null;
      if (category !== requestedCategory) return null;
      const k = size ?? "(no size)";
      return { key: k, label: k };
    }

    // type
    if (!requestedCategory) return null;
    if (category !== requestedCategory) return null;
    if (requestedSize !== null) {
      const effectiveSize = size ?? "(no size)";
      if (effectiveSize !== requestedSize) return null;
    }

    const typeLabel = subtype ?? name ?? "(unknown)";
    return { key: typeLabel, label: typeLabel };
  };

  const startBalByItemId = new Map<number, number>();
  const endBalByItemId = new Map<number, number>();
  const inByGroup = new Map<string, number>();
  const outByGroup = new Map<string, number>();

  const includeItemInScope = (it: ItemRow): boolean => {
    const category = String(it.category ?? "other");
    const size = it.size ? String(it.size) : null;
    if (input.group === "category") return true;
    if (input.group === "size") return !!requestedCategory && category === requestedCategory;
    // type
    if (!requestedCategory || category !== requestedCategory) return false;
    if (requestedSize !== null) {
      const effectiveSize = size ?? "(no size)";
      return effectiveSize === requestedSize;
    }
    return true;
  };

  for (const tx of txs) {
    const itemId = Number(tx.item_id);
    if (!Number.isFinite(itemId) || itemId <= 0) continue;
    const it = itemById.get(itemId);
    if (!it) continue;

    const delta = Number(tx.quantity_signed);
    if (!Number.isFinite(delta) || delta === 0) continue;

    const createdAt = new Date(tx.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    // Always contributes to end balance (since txs are <= end)
    endBalByItemId.set(itemId, (endBalByItemId.get(itemId) ?? 0) + delta);
    // Contributes to start balance if strictly before start boundary
    if (createdAt < start) {
      startBalByItemId.set(itemId, (startBalByItemId.get(itemId) ?? 0) + delta);
      continue;
    }

    // Movement within [start, end]
    if (!includeItemInScope(it)) continue;
    const grouping = groupKeyForItem(it);
    if (!grouping) continue;
    if (delta > 0) inByGroup.set(grouping.key, (inByGroup.get(grouping.key) ?? 0) + delta);
    else outByGroup.set(grouping.key, (outByGroup.get(grouping.key) ?? 0) + Math.abs(delta));
  }

  // Aggregate per group: derive start/end quantities from per-item balances
  const groups = new Map<string, { key: string; label: string; startQty: number; endQty: number; stockIn: number; stockOut: number }>();
  for (const [id, it] of itemById.entries()) {
    if (!includeItemInScope(it)) continue;
    const grouping = groupKeyForItem(it);
    if (!grouping) continue;
    const startQty = startBalByItemId.get(id) ?? 0;
    const endQty = endBalByItemId.get(id) ?? 0;
    const cur = groups.get(grouping.key) ?? {
      key: grouping.key,
      label: grouping.label,
      startQty: 0,
      endQty: 0,
      stockIn: 0,
      stockOut: 0,
    };
    cur.startQty += startQty;
    cur.endQty += endQty;
    groups.set(grouping.key, cur);
  }

  // Attach in/out
  for (const g of groups.values()) {
    g.stockIn = inByGroup.get(g.key) ?? 0;
    g.stockOut = outByGroup.get(g.key) ?? 0;
  }

  const rows: InventoryMovementRow[] = Array.from(groups.values()).map((g): InventoryMovementRow => {
    const startQty = Math.max(0, Math.round(g.startQty));
    const endQty = Math.max(0, Math.round(g.endQty));
    const stockIn = Math.max(0, Math.round(g.stockIn));
    const stockOut = Math.max(0, Math.round(g.stockOut));
    const net = Math.round(endQty - startQty);
    return {
      key: g.key,
      label: g.label,
      kind: "delta",
      stockIn,
      stockOut,
      net,
      startQty,
      endQty,
    };
  }).filter((r) => r.startQty !== 0 || r.endQty !== 0 || r.stockIn !== 0 || r.stockOut !== 0);

  rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  const totalStart = Math.max(0, Math.round(rows.reduce((sum, r) => sum + r.startQty, 0)));
  const totalEnd = Math.max(0, Math.round(rows.reduce((sum, r) => sum + r.endQty, 0)));
  const totalLabelStart = `total[${start.toISOString().slice(0, 10)}]`;
  const totalLabelEnd = `total[${end.toISOString().slice(0, 10)}]`;
  const withTotals: InventoryMovementRow[] = [
    {
      key: "__total_start__",
      label: totalLabelStart,
      kind: "total_start",
      stockIn: 0,
      stockOut: 0,
      net: 0,
      startQty: totalStart,
      endQty: totalStart,
    },
    ...rows,
    {
      key: "__total_end__",
      label: totalLabelEnd,
      kind: "total_end",
      stockIn: 0,
      stockOut: 0,
      net: 0,
      startQty: totalEnd,
      endQty: totalEnd,
    },
  ];

  return {
    ok: true as const,
    rows: withTotals,
    group: input.group,
    category: requestedCategory,
    size: requestedSize,
  };
}

