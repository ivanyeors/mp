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
  stockIn: number;
  stockOut: number;
  net: number;
};

export async function getInventoryMovementWaterfall(input: {
  from: string;
  to: string;
  group: InventoryMovementGroup;
  category?: string | null;
  size?: string | null;
}) {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Invalid date range");
  }

  const admin = supabaseAdmin();

  const { data: txRows, error: txErr } = await admin
    .from("inventory_transactions")
    .select("item_id,quantity_signed,created_at")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());
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

  const agg = new Map<string, { key: string; label: string; stockIn: number; stockOut: number; net: number }>();
  for (const tx of txs) {
    const itemId = Number(tx.item_id);
    if (!Number.isFinite(itemId) || itemId <= 0) continue;
    const it = itemById.get(itemId);
    if (!it) continue;
    const grouping = groupKeyForItem(it);
    if (!grouping) continue;

    const delta = Number(tx.quantity_signed);
    if (!Number.isFinite(delta) || delta === 0) continue;

    const cur = agg.get(grouping.key) ?? { key: grouping.key, label: grouping.label, stockIn: 0, stockOut: 0, net: 0 };
    if (delta > 0) cur.stockIn += delta;
    else cur.stockOut += Math.abs(delta);
    cur.net += delta;
    agg.set(grouping.key, cur);
  }

  const rows: InventoryMovementRow[] = Array.from(agg.values()).map((r) => ({
    key: r.key,
    label: r.label,
    stockIn: Math.round(r.stockIn),
    stockOut: Math.round(r.stockOut),
    net: Math.round(r.net),
  }));

  rows.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  return {
    ok: true as const,
    rows,
    group: input.group,
    category: requestedCategory,
    size: requestedSize,
  };
}

