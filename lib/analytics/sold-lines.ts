import type { MonthKey } from "./sg-calendar";
import { sgMonthKey, sgMonthStart } from "./sg-calendar";

export type SoldLineGroup = "pillow" | "bolster" | "part" | "service" | "unmapped";

export type SoldLine = {
  group: SoldLineGroup;
  key: string;
  label: string;
  category?: string | null;
  units: number;
  gross: number;
  cost: number | null;
  uncostedReason?: string | null;
};

export type SoldOrder = {
  soldAt: string;
  productRevenue: number;
  lines: SoldLine[];
};

export type MarginTotals = {
  revenue: number;
  costedRevenue: number;
  uncostedRevenue: number;
  cogs: number;
  grossMargin: number;
  marginPct: number | null;
  units: number;
};

export type SalesSummary = MarginTotals & {
  orderCount: number;
  lineCount: number;
  uncostedLineCount: number;
  coveragePct: number | null;
  currency: "SGD";
};

export type BreakdownRow = MarginTotals & {
  key: string;
  label: string;
  parent: string | null;
};

export type TimelinePoint = { date: string; units: number; revenue: number };
export type TimelineSeries = { id: string; name: string; category: string; data: TimelinePoint[] };

export type CostGap = {
  key: string;
  label: string;
  reason: string;
  lines: number;
  units: number;
  revenue: number;
};

export type SalesReport = {
  summary: SalesSummary;
  products: BreakdownRow[];
  parts: BreakdownRow[];
  timeline: { parts: TimelineSeries[]; products: TimelineSeries[]; currency: "SGD" };
  gaps: CostGap[];
};

export type SalesReportWithoutCost = {
  summary: Pick<SalesSummary, "revenue" | "units" | "orderCount" | "lineCount" | "currency">;
  timeline: SalesReport["timeline"];
};

export function salesReportWithoutCost(report: SalesReport): SalesReportWithoutCost {
  const { revenue, units, orderCount, lineCount, currency } = report.summary;
  return { summary: { revenue, units, orderCount, lineCount, currency }, timeline: report.timeline };
}

type AllocatedLine = SoldLine & { revenue: number; month: MonthKey };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function latestChargeAt(charges: Array<{ orderId: string; at: string }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of charges) {
    const t = Date.parse(c.at);
    if (Number.isNaN(t)) continue;
    const prev = out.get(c.orderId);
    if (prev == null || t > Date.parse(prev)) out.set(c.orderId, new Date(t).toISOString());
  }
  return out;
}

export function allocateOrderRevenue(order: SoldOrder): Array<SoldLine & { revenue: number }> {
  const gross = order.lines.reduce((sum, l) => sum + Math.max(0, l.gross), 0);
  const revenue = Math.max(0, order.productRevenue);
  return order.lines.map((l) => ({
    ...l,
    revenue:
      gross > 0 ? (revenue * Math.max(0, l.gross)) / gross : order.lines.length ? revenue / order.lines.length : 0,
  }));
}

function emptyTotals(): MarginTotals {
  return { revenue: 0, costedRevenue: 0, uncostedRevenue: 0, cogs: 0, grossMargin: 0, marginPct: null, units: 0 };
}

function add(t: MarginTotals, l: AllocatedLine): void {
  t.revenue += l.revenue;
  t.units += l.units;
  if (l.cost == null) {
    t.uncostedRevenue += l.revenue;
  } else {
    t.costedRevenue += l.revenue;
    t.cogs += l.cost;
  }
}

function finish<T extends MarginTotals>(t: T): T {
  const costedRevenue = round2(t.costedRevenue);
  const cogs = round2(t.cogs);
  const grossMargin = round2(costedRevenue - cogs);
  return {
    ...t,
    revenue: round2(t.revenue),
    costedRevenue,
    uncostedRevenue: round2(t.uncostedRevenue),
    cogs,
    grossMargin,
    marginPct: costedRevenue > 0 ? (grossMargin / costedRevenue) * 100 : null,
  };
}

function summarise(lines: AllocatedLine[], orderCount: number): SalesSummary {
  const t = emptyTotals();
  let uncostedLineCount = 0;
  for (const l of lines) {
    add(t, l);
    if (l.cost == null) uncostedLineCount += 1;
  }
  const done = finish(t);
  return {
    ...done,
    orderCount,
    lineCount: lines.length,
    uncostedLineCount,
    coveragePct: done.revenue > 0 ? (done.costedRevenue / done.revenue) * 100 : null,
    currency: "SGD",
  };
}

const TIER_LABEL: Record<string, string> = { premium: "Premium Mpillow", basic: "Basic Mpillow" };
const PART_CATEGORY_LABEL: Record<string, string> = {
  cover: "Covers",
  pillow_case: "Pillow cases",
  bolster_case: "Bolster cases",
  pillow_protector: "Pillow protectors",
  bolster_protector: "Bolster protectors",
  filling: "Fillings",
  packaging: "Packaging",
  accessories: "Accessories",
  other: "Other",
};

export function partCategoryLabel(category: string): string {
  return (
    PART_CATEGORY_LABEL[category] ??
    category
      .split(/[_-]/g)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function productParent(l: SoldLine): { key: string; label: string } | null {
  if (l.group === "pillow") {
    const tier = l.key.split(":")[1] ?? "basic";
    return { key: `pillow:${tier}`, label: TIER_LABEL[tier] ?? "Mpillow" };
  }
  if (l.group === "bolster") return { key: "bolster", label: "Mbolster" };
  if (l.group === "unmapped") return { key: "unmapped", label: "Not linked to inventory" };
  return null;
}

function partParent(l: SoldLine): { key: string; label: string } | null {
  if (l.group === "part") {
    const category = l.category || "other";
    return { key: `category:${category}`, label: partCategoryLabel(category) };
  }
  if (l.group === "service") return { key: "services", label: "Services" };
  return null;
}

function breakdown(
  lines: AllocatedLine[],
  parentOf: (l: SoldLine) => { key: string; label: string } | null,
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();
  const order: string[] = [];
  const row = (key: string, label: string, parent: string | null) => {
    let r = rows.get(key);
    if (!r) {
      r = { ...emptyTotals(), key, label, parent };
      rows.set(key, r);
      order.push(key);
    }
    return r;
  };
  for (const l of lines) {
    const p = parentOf(l);
    if (!p) continue;
    add(row(p.key, p.label, null), l);
    add(row(`${p.key}>${l.key}`, l.label, p.key), l);
  }
  return order
    .map((k) => finish(rows.get(k)!))
    .sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label));
}

function timeline(
  lines: AllocatedLine[],
  months: MonthKey[],
  seriesOf: (l: SoldLine) => { id: string; name: string; category: string } | null,
): TimelineSeries[] {
  const series = new Map<string, { name: string; category: string; byMonth: Map<MonthKey, TimelinePoint> }>();
  for (const l of lines) {
    const s = seriesOf(l);
    if (!s) continue;
    const entry = series.get(s.id) ?? { name: s.name, category: s.category, byMonth: new Map() };
    const pt = entry.byMonth.get(l.month) ?? { date: "", units: 0, revenue: 0 };
    pt.units += l.units;
    pt.revenue += l.revenue;
    entry.byMonth.set(l.month, pt);
    series.set(s.id, entry);
  }
  return Array.from(series.entries())
    .map(([id, s]) => ({
      id,
      name: s.name,
      category: s.category,
      data: months.map((m) => {
        const pt = s.byMonth.get(m);
        return { date: sgMonthStart(m).toISOString(), units: pt?.units ?? 0, revenue: round2(pt?.revenue ?? 0) };
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function gaps(lines: AllocatedLine[]): CostGap[] {
  const byKey = new Map<string, CostGap>();
  for (const l of lines) {
    if (l.cost != null) continue;
    const reason = l.uncostedReason || "No cost was recorded when it sold.";
    const id = `${l.key}|${reason}`;
    const g = byKey.get(id) ?? {
      key: l.key,
      label: l.label,
      reason,
      lines: 0,
      units: 0,
      revenue: 0,
    };
    g.lines += 1;
    g.units += l.units;
    g.revenue += l.revenue;
    byKey.set(id, g);
  }
  return Array.from(byKey.values())
    .map((g) => ({ ...g, revenue: round2(g.revenue) }))
    .sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label));
}

export function buildSalesReport(input: { orders: SoldOrder[]; months: MonthKey[] }): SalesReport {
  const lines: AllocatedLine[] = [];
  for (const order of input.orders) {
    const month = sgMonthKey(order.soldAt);
    for (const l of allocateOrderRevenue(order)) lines.push({ ...l, month });
  }

  return {
    summary: summarise(lines, input.orders.length),
    products: breakdown(lines, productParent),
    parts: breakdown(lines, partParent),
    timeline: {
      products: timeline(lines, input.months, (l) => {
        const p = productParent(l);
        if (!p) return null;
        return l.group === "unmapped"
          ? { id: p.key, name: p.label, category: "unmapped" }
          : { id: l.key, name: `${p.label} · ${l.label}`, category: l.group };
      }),
      parts: timeline(lines, input.months, (l) => {
        const p = partParent(l);
        return p ? { id: p.key, name: p.label, category: l.group === "service" ? "service" : (l.category ?? "other") } : null;
      }),
      currency: "SGD",
    },
    gaps: gaps(lines),
  };
}
