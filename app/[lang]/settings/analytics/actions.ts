"use server";

import {
  getChannelSalesSummary,
  type AnalyticsChannel,
} from "@/lib/analytics/channel-sales";
import { assertAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";

export type SalesMetric = "units" | "revenue";
export type TimelineViewMode = "parts" | "products";
// ponytail: do not `export type { X }` from "use server" — SWC emits runtime refs (TimelinePoint is not defined)

function parseChannel(raw: string | undefined): AnalyticsChannel {
  if (raw === "orders" || raw === "shopify" || raw === "all") return raw;
  return "all";
}

/** Channel sales timeline from mirror/platform DB (no Admin API). */
export async function getShopifySalesTimeline(input: {
  from: string;
  to: string;
  channel?: AnalyticsChannel;
}) {
  await assertAdmin("analytics");
  const res = await getChannelSalesSummary({
    channel: parseChannel(input.channel),
    from: input.from,
    to: input.to,
  });
  return {
    ok: true as const,
    parts: res.timeline.parts,
    products: res.timeline.products,
    currency: res.timeline.currency,
    totals: res.timeline.totals,
  };
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
  await assertAdmin("analytics");
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
  await assertAdmin("analytics");
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

export type RealizedMarginSummary = {
  net_revenue: number;
  cogs: number;
  gross_margin: number;
  margin_pct: number | null;
  order_count: number;
};

export async function getRealizedMarginSummary(input: {
  from: string;
  to: string;
  channel?: AnalyticsChannel;
}): Promise<{ ok: true; summary: RealizedMarginSummary }> {
  await assertAdmin("analytics");
  // paid_at only via channel-sales (no unpaid-by-created_at).
  const res = await getChannelSalesSummary({
    channel: parseChannel(input.channel),
    from: input.from,
    to: input.to,
  });
  return {
    ok: true,
    summary: {
      net_revenue: res.summary.net_revenue,
      cogs: res.summary.cogs,
      gross_margin: res.summary.gross_margin,
      margin_pct: res.summary.margin_pct,
      order_count: res.summary.order_count,
    },
  };
}

export type JourneyTransitionNode = {
  path: string;
  views: number;
  prospects: number;
  dropOffs: number;
  dropOffPct: number;
  medianDwellMs: number | null;
  topDropOffSection: string | null;
  returnHits: null;
  medianReturnGapMs: null;
};
export type JourneyTransitionEdge = { from: string; to: string; count: number };
export type JourneySectionNode = {
  path: string;
  sectionId: string;
  views: number;
  dropOffs: number;
};
export type JourneyNodeDetail = {
  path: string;
  exitSections: { sectionId: string; count: number }[];
  dwellMsSamples: number[];
  medianDwellMs: number | null;
  samplePaths: string[][];
};

/** Page→page transitions from analytics_events only (no live GA). */
export async function getProspectJourneyTransitions(input: {
  from: string;
  to: string;
  /** Filter by Visit.entry_source; omit / empty = all. */
  entrySource?: string | null;
  /** Expand this page path into section child nodes. */
  expandPath?: string | null;
  /** Include side-panel detail for this page path. */
  detailPath?: string | null;
}): Promise<
  | {
      ok: true;
      nodes: JourneyTransitionNode[];
      edges: JourneyTransitionEdge[];
      entrySources: string[];
      sections: JourneySectionNode[];
      expandablePaths: string[];
      detail: JourneyNodeDetail | null;
    }
  | { ok: false; error: string }
> {
  await assertAdmin("analytics");
  try {
    const { listEntrySourcesFromDb, loadPageTransitionsFromDb } = await import(
      "@/lib/analytics/journey/aggregates"
    );
    const db = supabaseAdmin();
    const entrySource = input.entrySource?.trim() || null;
    const expandPath = input.expandPath?.trim() || null;
    const detailPath = input.detailPath?.trim() || null;
    const [{ nodes, edges, sections, expandablePaths, detail }, entrySources] =
      await Promise.all([
        loadPageTransitionsFromDb(db, {
          from: input.from,
          to: input.to,
          entrySource,
          expandPath,
          detailPath,
        }),
        listEntrySourcesFromDb(db),
      ]);
    return { ok: true, nodes, edges, entrySources, sections, expandablePaths, detail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load journey" };
  }
}
