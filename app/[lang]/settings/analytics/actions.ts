"use server";

import { loadSalesReport } from "@/lib/analytics/sales-report";
import { partCategoryLabel } from "@/lib/analytics/sold-lines";
import { sgDate, sgMonthRange } from "@/lib/analytics/sg-calendar";
import { assertAdmin } from "@/lib/auth/admin";
import { selectAll, selectAllIn } from "@/lib/supabase/select-all";
import { supabaseAdmin } from "@/lib/supabase/server";

export type SalesMetric = "units" | "revenue";
export type TimelineViewMode = "parts" | "products";
// ponytail: do not `export type { X }` from "use server" — SWC emits runtime refs (TimelinePoint is not defined)

export async function getSalesReport(input: { from: string; to: string }) {
  await assertAdmin("analytics");
  const report = await loadSalesReport({ from: input.from, to: input.to });
  return { ok: true as const, ...report };
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
  const range = sgMonthRange(input.from, input.to);

  const admin = supabaseAdmin();
  const rows = await selectAll(() =>
    admin
      .from("mp_config_responses")
      .select("id,data")
      .eq("is_final", true)
      .gte("created_at", range.from.toISOString())
      .lt("created_at", range.toExclusive.toISOString())
      .order("id"),
  );

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

  const responseRows = rows as Array<{ data?: unknown }>;
  for (const r of responseRows) {
    const data = (r?.data ?? {}) as Record<string, unknown>;
    for (const cfg of configs) {
      const raw = data[cfg.key];
      if (typeof raw !== "string") continue;
      const v = raw.trim();
      if (!v) continue;
      const metricCounts = countsByMetricKey.get(cfg.key);
      if (!metricCounts) continue;
      if (!metricCounts.has(v)) continue;
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
  const range = sgMonthRange(input.from, input.to);
  const start = range.from;

  const admin = supabaseAdmin();

  const txRows = await selectAll(() =>
    admin
      .from("inventory_transactions")
      .select("id,item_id,quantity_signed,created_at")
      .lt("created_at", range.toExclusive.toISOString())
      .order("id"),
  );

  type TxRow = { item_id: number | string; quantity_signed: number | string; created_at: string };
  const txs = txRows as TxRow[];

  const itemIds = Array.from(
    new Set(
      txs
        .map((t) => Number(t.item_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    )
  );

  type ItemRow = { id: number | string; category: string | null; size: string | null; subtype: string | null; name: string | null };
  const itemById = new Map<number, ItemRow>();
  const itemRows = (await selectAllIn(itemIds, (chunk) =>
    admin.from("items").select("id,category,size,subtype,name").in("id", chunk).order("id"),
  )) as ItemRow[];
  itemRows.forEach((r) => {
    const id = Number(r.id);
    if (!Number.isFinite(id) || id <= 0) return;
    itemById.set(id, r);
  });

  const requestedCategory = input.category ? String(input.category) : null;
  const requestedSize = input.size ? String(input.size) : null;

  const groupKeyForItem = (it: ItemRow): { key: string; label: string } | null => {
    const category = String(it.category ?? "other");
    const size = it.size ? String(it.size) : null;
    const subtype = it.subtype ? String(it.subtype) : null;
    const name = it.name ? String(it.name) : null;

    if (input.group === "category") {
      return { key: category, label: partCategoryLabel(category) };
    }

    if (input.group === "size") {
      if (!requestedCategory) return null;
      if (category !== requestedCategory) return null;
      const k = size ?? "(no size)";
      return { key: k, label: k };
    }

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

    endBalByItemId.set(itemId, (endBalByItemId.get(itemId) ?? 0) + delta);
    if (createdAt < start) {
      startBalByItemId.set(itemId, (startBalByItemId.get(itemId) ?? 0) + delta);
      continue;
    }

    if (!includeItemInScope(it)) continue;
    const grouping = groupKeyForItem(it);
    if (!grouping) continue;
    if (delta > 0) inByGroup.set(grouping.key, (inByGroup.get(grouping.key) ?? 0) + delta);
    else outByGroup.set(grouping.key, (outByGroup.get(grouping.key) ?? 0) + Math.abs(delta));
  }

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

  for (const g of groups.values()) {
    g.stockIn = inByGroup.get(g.key) ?? 0;
    g.stockOut = outByGroup.get(g.key) ?? 0;
  }

  const rows: InventoryMovementRow[] = Array.from(groups.values()).map((g): InventoryMovementRow => {
    const startQty = Math.round(g.startQty);
    const endQty = Math.round(g.endQty);
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

  const totalStart = Math.round(rows.reduce((sum, r) => sum + r.startQty, 0));
  const totalEnd = Math.round(rows.reduce((sum, r) => sum + r.endQty, 0));
  const totalLabelStart = `Opening ${sgDate(start)}`;
  const totalLabelEnd = `Closing ${sgDate(new Date(range.toExclusive.getTime() - 1))}`;
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

export type JourneyTransitionNode = {
  path: string;
  views: number;
  prospects: number;
  dropOffs: number;
  dropOffPct: number;
  medianDwellMs: number | null;
  topDropOffSection: string | null;
  returnHits: number;
  medianReturnGapMs: number | null;
  groupedPaths?: number;
};
export type JourneyTransitionEdge = {
  from: string;
  to: string;
  count: number;
  dashed?: boolean;
  country?: string;
};
export type JourneySectionNode = {
  path: string;
  sectionId: string;
  views: number;
  dropOffs: number;
};
export type JourneyNodeDetail = {
  path: string;
  exitSections: { sectionId: string; count: number; sharePct: number }[];
  dwellMsSamples: number[];
  medianDwellMs: number | null;
  routes: { pathSeq: string[]; count: number }[];
  returnTimeline: {
    returnedAt: string;
    gapMs: number;
    priorDropOffPath: string | null;
  }[];
  outbound: { to: string; count: number }[];
};

export type JourneyGroupDetail = {
  kind: "pages" | "sources";
  total: number;
  members: { label: string; count: number; sharePct: number }[];
};
export type JourneyConvertedDetail = {
  count: number;
  totalValue: number;
  byEntrySource: { entrySource: string; count: number; totalValue: number }[];
  samples: {
    entrySource: string;
    journeyDurationMs: number;
    orderValue: number;
    shortPath: string[];
  }[];
};

export async function getProspectJourneyTransitions(input: {
  from: string;
  to: string;
  entrySource?: string | null;
  visitorCohort?: "new" | "returning" | null;
  countries?: string[] | null;
  includeConverted?: boolean;
  expandPath?: string | null;
  entryNodes?: boolean;
  entryTopN?: number;
  groupPaths?: boolean;
}): Promise<
  | {
      ok: true;
      nodes: JourneyTransitionNode[];
      edges: JourneyTransitionEdge[];
      entrySources: string[];
      countries: string[];
      countryLegend: { code: string; color: string }[];
      sections: JourneySectionNode[];
      expandablePaths: string[];
    }
  | { ok: false; error: string }
> {
  await assertAdmin("analytics");
  try {
    const [{ loadPageTransitionsFromDb }, { readJourneyFacets }] = await Promise.all([
      import("@/lib/analytics/journey/aggregates"),
      import("@/lib/analytics/journey/cached"),
    ]);
    const db = supabaseAdmin();
    const entrySource = input.entrySource?.trim() || null;
    const visitorCohort =
      input.visitorCohort === "new" || input.visitorCohort === "returning"
        ? input.visitorCohort
        : null;
    const countries = (input.countries ?? [])
      .map((c) => c.trim())
      .filter(Boolean);
    const expandPath = input.expandPath?.trim() || null;
    const [
      { nodes, edges, sections, expandablePaths, countryLegend },
      { entrySources, countries: countryOptions },
    ] = await Promise.all([
      loadPageTransitionsFromDb(db, {
        from: input.from,
        to: input.to,
        entrySource,
        visitorCohort,
        countries: countries.length > 0 ? countries : null,
        includeConverted: input.includeConverted === true,
        expandPath,
        groupPaths: input.groupPaths !== false,
        entryNodes: input.entryNodes !== false,
        entryTopN:
          typeof input.entryTopN === "number" && input.entryTopN >= 0
            ? input.entryTopN
            : undefined,
      }),
      readJourneyFacets(),
    ]);
    return {
      ok: true,
      nodes,
      edges,
      entrySources,
      countries: countryOptions,
      countryLegend,
      sections,
      expandablePaths,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load journey" };
  }
}

export async function getProspectJourneyNodeDetails(input: {
  paths: string[];
  from: string;
  to: string;
  entrySource?: string | null;
  visitorCohort?: "new" | "returning" | null;
  countries?: string[] | null;
  includeConverted?: boolean;
  groupPaths?: boolean;
  entryTopN?: number;
}): Promise<
  | {
      ok: true;
      details: {
        path: string;
        detail: JourneyNodeDetail | null;
        groupDetail: JourneyGroupDetail | null;
        convertedDetail: JourneyConvertedDetail | null;
      }[];
    }
  | { ok: false; error: string }
> {
  await assertAdmin("analytics");
  try {
    const { loadNodeDetailsFromDb } = await import(
      "@/lib/analytics/journey/aggregates"
    );
    const paths = [
      ...new Set((input.paths ?? []).map((p) => p?.trim()).filter(Boolean)),
    ];
    if (paths.length === 0) return { ok: false, error: "paths required" };
    const entrySource = input.entrySource?.trim() || null;
    const visitorCohort =
      input.visitorCohort === "new" || input.visitorCohort === "returning"
        ? input.visitorCohort
        : null;
    const countries = (input.countries ?? [])
      .map((c) => c.trim())
      .filter(Boolean);
    const details = await loadNodeDetailsFromDb(supabaseAdmin(), {
      paths,
      from: input.from,
      to: input.to,
      entrySource,
      visitorCohort,
      countries: countries.length > 0 ? countries : null,
      includeConverted: input.includeConverted === true,
      groupPaths: input.groupPaths !== false,
      entryTopN:
        typeof input.entryTopN === "number" && input.entryTopN >= 0
          ? input.entryTopN
          : undefined,
    });
    return { ok: true, details };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to load detail" };
  }
}

