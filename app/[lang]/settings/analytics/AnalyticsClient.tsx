"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
import type { CategoryStackDatum, ItemStackDatum } from "./MarginByCategoryVisx";
import type { AnalyticsChannel } from "@/lib/analytics/channel-sales";
import {
  getAnalyticsDashboard,
  getInventoryMovementWaterfall,
  getMpConfigMetricsBreakdown,
  getRealizedMarginSummary,
  getShopifySalesTimeline,
  type InventoryMovementGroup,
  type InventoryMovementRow,
  type MpConfigMetricBreakdown,
  type RealizedMarginSummary,
} from "./actions";

const CardSkeleton = () => <div className="min-h-[360px] w-full animate-pulse rounded-xl bg-muted" />;
const ProductConfigurationCard = dynamic(() => import("./ProductConfigurationCard").then((m) => m.ProductConfigurationCard), { ssr: false, loading: CardSkeleton });
const ProspectJourneyCard = dynamic(() => import("./ProspectJourneyCard").then((m) => m.ProspectJourneyCard), { ssr: false, loading: CardSkeleton });
const MarginByCategoryVisx = dynamic(() => import("./MarginByCategoryVisx").then((m) => m.MarginByCategoryVisx), { ssr: false });
const MarginByProductVisx = dynamic(() => import("./MarginByProductVisx").then((m) => m.MarginByProductVisx), { ssr: false });
const ProductTimelineVisx = dynamic(() => import("./ProductTimelineVisx").then((m) => m.ProductTimelineVisx), { ssr: false });
const InventoryMovementWaterfallVisx = dynamic(() => import("./InventoryMovementWaterfallVisx").then((m) => m.InventoryMovementWaterfallVisx), { ssr: false });
const MpConfigMetricsStackedBarVisx = dynamic(() => import("./MpConfigMetricsStackedBarVisx").then((m) => m.MpConfigMetricsStackedBarVisx), { ssr: false });
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

type PriceRecord = { cost_price: string | number | null; msrp: string | number | null };

type RawItemRow = {
  id: number;
  category: string;
  name: string;
  size: string | null;
  subtype: string | null;
  pricing?: PriceRecord | PriceRecord[] | null;
};

type ItemMetrics = {
  id: number;
  category: string;
  name: string;
  size: string | null;
  subtype: string | null;
  cost: number | null;
  msrp: number | null;
};

type CategorySummary = {
  category: string;
  label: string;
  totalItems: number;
  pricedItems: number;
  totalOnHand: number;
  costValue: number;
  msrpValue: number;
  marginValue: number;
  weightedMarginPct: number | null;
  markupPct: number | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  cover: "Covers",
  pillow_case: "Pillow Cases",
  bolster_case: "Bolster Cases",
  pillow_protector: "Pillow Protectors",
  bolster_protector: "Bolster Protectors",
  filling: "Fillings",
  packaging: "Packaging",
  accessories: "Accessories",
  other: "Other",
};

const CATEGORY_ORDER = [
  "cover",
  "pillow_case",
  "pillow_protector",
  "bolster_case",
  "bolster_protector",
  "filling",
  "packaging",
  "accessories",
  "other",
];

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

const humanize = (value: string) =>
  value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const normalizeNameOrFallback = (value: string | null | undefined, fallback: string): string => {
  if (!value) return humanize(fallback);
  const trimmed = value.trim();
  if (trimmed === "") return humanize(fallback);
  if (/[_-]/.test(trimmed) || trimmed === trimmed.toLowerCase()) {
    return humanize(trimmed);
  }
  return trimmed;
};

const describeItem = (item: ItemMetrics): string => {
  if (item.category === "filling") {
    const base = normalizeNameOrFallback(item.subtype ?? item.name, "filling");
    return item.size ? `${base} — ${item.size}` : base;
  }
  const base = normalizeNameOrFallback(item.name, item.category);
  if (item.size) {
    return `${base} — ${item.size}`;
  }
  if (item.subtype) {
    return `${base} — ${normalizeNameOrFallback(item.subtype, item.category)}`;
  }
  return base;
};

/**
 * One slice of the combined `getAnalyticsDashboard` payload. Structurally
 * identical to the server's `AnalyticsDashboardSlice`, declared here so the
 * client does not import a type across the "use server" boundary.
 */
type DashboardSlice<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Unpack one dashboard slice into its card. A slice that failed on the server
 * reports through `onError` alone, so one broken card cannot blank the others
 * — matching the behaviour of the four separate actions this replaced.
 */
function applySlice<T>(
  slice: DashboardSlice<T>,
  apply: (value: T) => void,
  fallback: string,
  onError: (message: string) => void
): void {
  try {
    if (!slice.ok) throw new Error(slice.error);
    apply(slice.value);
  } catch (err) {
    onError(err instanceof Error ? err.message : fallback);
  }
}

export default function AnalyticsClient() {
  const [items, setItems] = useState<ItemMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<AnalyticsChannel>("all");
  const [marginView, setMarginView] = useState<"parts" | "products">("parts");
  const [timelineView, setTimelineView] = useState<"parts" | "products">("parts");
  const [timelineMetric, setTimelineMetric] = useState<"units" | "revenue">("units");
  const [timelineDateRange, setTimelineDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(subMonths(new Date(), 5)),
    to: endOfMonth(new Date()),
  });
  const isMobile = useIsMobile();
  const [isTimelineCalendarOpen, setIsTimelineCalendarOpen] = useState(false);
  const [activeTimelineDateEdge, setActiveTimelineDateEdge] = useState<"from" | "to">("to");
  const [hoverTimelineDateEdge, setHoverTimelineDateEdge] = useState<"from" | "to" | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineRefreshing, setTimelineRefreshing] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineCurrency, setTimelineCurrency] = useState<string | null>(null);
  const [soldPartUnitsByItemId, setSoldPartUnitsByItemId] = useState<Record<string, number>>({});
  const [soldPillowUnitsByKindSize, setSoldPillowUnitsByKindSize] = useState<Record<string, number>>({});
  const [soldPillowUnitsByTemplateId, setSoldPillowUnitsByTemplateId] = useState<Record<string, number>>({});
  const [partsTimeline, setPartsTimeline] = useState<
    Array<{ id: string; name: string; category: string; data: Array<{ date: Date; units: number; revenue: number }> }>
  >([]);
  const [productsTimeline, setProductsTimeline] = useState<
    Array<{ id: string; name: string; category: string; data: Array<{ date: Date; units: number; revenue: number }> }>
  >([]);

  const [inventoryRows, setInventoryRows] = useState<InventoryMovementRow[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [inventoryGroup, setInventoryGroup] = useState<InventoryMovementGroup>("category");
  const [inventoryCategory, setInventoryCategory] = useState<string | null>(null);
  const [inventorySize, setInventorySize] = useState<string | null>(null);

  const [mpMetrics, setMpMetrics] = useState<MpConfigMetricBreakdown[]>([]);
  const [mpMetricsLoading, setMpMetricsLoading] = useState(false);
  const [mpMetricsRefreshing, setMpMetricsRefreshing] = useState(false);
  const [mpMetricsError, setMpMetricsError] = useState<string | null>(null);

  const [realizedMargin, setRealizedMargin] = useState<RealizedMarginSummary | null>(null);
  const [realizedMarginLoading, setRealizedMarginLoading] = useState(false);
  const [realizedMarginError, setRealizedMarginError] = useState<string | null>(null);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: "SGD",
        maximumFractionDigits: 0,
      }),
    []
  );

  const formatPercent = useCallback((value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    return `${value.toFixed(1)}%`;
  }, []);

  const handleTimelineDateRangeSelect = useCallback(
    (range: { from?: Date; to?: Date } | undefined) => {
      if (!range?.from && !range?.to) return;

      setTimelineDateRange((prev) => {
        const prevFromMs = prev.from.getTime();
        const prevToMs = prev.to.getTime();
        const nextFromMs = range.from?.getTime() ?? null;
        const nextToMs = range.to?.getTime() ?? null;

        // DayPicker range mode may keep range.from stable while placing the newly clicked date into range.to.
        // We choose whichever boundary actually changed compared to current state.
        const picked = (() => {
          if (activeTimelineDateEdge === "from") {
            if (nextFromMs !== null && nextFromMs !== prevFromMs) return range.from;
            if (nextToMs !== null && nextToMs !== prevToMs) return range.to;
            return range.from ?? range.to;
          }
          // activeTimelineDateEdge === "to"
          if (nextToMs !== null && nextToMs !== prevToMs) return range.to;
          if (nextFromMs !== null && nextFromMs !== prevFromMs) return range.from;
          return range.to ?? range.from;
        })();
        if (!picked) return prev;

        let nextFrom = prev.from;
        let nextTo = prev.to;

        if (activeTimelineDateEdge === "from") {
          nextFrom = startOfMonth(picked);
          if (nextFrom > nextTo) nextTo = endOfMonth(nextFrom);
        } else {
          nextTo = endOfMonth(picked);
          if (nextTo < nextFrom) nextFrom = startOfMonth(nextTo);
        }

        return { from: nextFrom, to: nextTo };
      });

      setIsTimelineCalendarOpen(false);
    },
    [activeTimelineDateEdge]
  );

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const { data: itemRows, error: itemsError } = await supabaseClient
          .from("items")
          .select("id,category,name,size,subtype,pricing:item_prices(cost_price,msrp)")
          .eq("is_active", true);

        if (itemsError) {
          throw new Error(itemsError.message);
        }

        const nextItems = (itemRows ?? []).map((row: RawItemRow) => {
          const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
          const cost = toNumber(pricing?.cost_price);
          const msrp = toNumber(pricing?.msrp);
          return {
            id: row.id,
            category: row.category,
            name: row.name,
            size: row.size,
            subtype: row.subtype,
            cost,
            msrp,
          };
        });

        setItems(nextItems);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load analytics";
        setError(message);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  const soldUnitsByItemId = useMemo(() => {
    const m = new Map<number, number>();
    Object.entries(soldPartUnitsByItemId).forEach(([key, value]) => {
      const id = Number(key);
      const units = Number(value ?? 0);
      if (!Number.isFinite(id) || id <= 0) return;
      if (!Number.isFinite(units) || units <= 0) return;
      m.set(id, units);
    });
    return m;
  }, [soldPartUnitsByItemId]);

  // Result shapes of the individual loaders. The combined dashboard action
  // returns exactly these payloads, so the fan-out below is written once and
  // reused by both the per-card refresh buttons and the combined load.
  type TimelineResult = Awaited<ReturnType<typeof getShopifySalesTimeline>>;
  type MpMetricsResult = Awaited<ReturnType<typeof getMpConfigMetricsBreakdown>>;
  type RealizedMarginResult = Awaited<ReturnType<typeof getRealizedMarginSummary>>;
  type InventoryMovementResult = Awaited<ReturnType<typeof getInventoryMovementWaterfall>>;

  const applyTimeline = useCallback((res: TimelineResult) => {
    if (!res.ok) throw new Error("Failed to load sales timeline");

    const labelForCategory = (category: string) => CATEGORY_LABELS[category] ?? normalizeNameOrFallback(category, category);

    const mapSeries = (series: typeof res.parts) =>
      series.map((s) => ({
        id: s.id,
        name: labelForCategory(s.name),
        category: s.category,
        data: s.data.map((pt) => ({
          date: new Date(pt.date),
          units: Number(pt.units ?? 0),
          revenue: Number(pt.revenue ?? 0),
        })),
      }));

    setPartsTimeline(mapSeries(res.parts));
    setProductsTimeline(
      res.products.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        data: s.data.map((pt) => ({
          date: new Date(pt.date),
          units: Number(pt.units ?? 0),
          revenue: Number(pt.revenue ?? 0),
        })),
      }))
    );
    setTimelineCurrency(res.currency ?? null);
    setSoldPartUnitsByItemId(res.totals?.partUnitsByItemId ?? {});
    setSoldPillowUnitsByKindSize(res.totals?.pillowUnitsByKindSize ?? {});
    setSoldPillowUnitsByTemplateId(res.totals?.pillowUnitsByTemplateId ?? {});
  }, []);

  const applyMpMetrics = useCallback((res: MpMetricsResult) => {
    if (!res.ok) throw new Error("Failed to load mp-config metrics");
    setMpMetrics(res.metrics ?? []);
  }, []);

  const applyRealizedMargin = useCallback((res: RealizedMarginResult) => {
    if (!res.ok) throw new Error("Failed to load realized margin");
    setRealizedMargin(res.summary);
  }, []);

  const applyInventoryMovement = useCallback((res: InventoryMovementResult) => {
    if (!res.ok) throw new Error("Failed to load inventory movements");
    setInventoryRows(res.rows);
  }, []);

  // Kept for the per-card refresh button on the timeline card.
  const loadTimeline = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setTimelineLoading(true);
      else setTimelineRefreshing(true);
      setTimelineError(null);
      try {
        applyTimeline(
          await getShopifySalesTimeline({
            from: timelineDateRange.from.toISOString(),
            to: timelineDateRange.to.toISOString(),
            channel,
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load sales timeline";
        setTimelineError(message);
      } finally {
        if (mode === "initial") setTimelineLoading(false);
        else setTimelineRefreshing(false);
      }
    },
    [timelineDateRange.from, timelineDateRange.to, channel, applyTimeline]
  );

  // Kept for the per-card refresh button on the mp-config metrics card.
  const loadMpMetrics = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") setMpMetricsLoading(true);
      else setMpMetricsRefreshing(true);
      setMpMetricsError(null);
      try {
        applyMpMetrics(
          await getMpConfigMetricsBreakdown({
            from: timelineDateRange.from.toISOString(),
            to: timelineDateRange.to.toISOString(),
          })
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to load mp-config metrics";
        setMpMetricsError(message);
        setMpMetrics([]);
      } finally {
        if (mode === "initial") setMpMetricsLoading(false);
        else setMpMetricsRefreshing(false);
      }
    },
    [timelineDateRange.from, timelineDateRange.to, applyMpMetrics]
  );

  // The waterfall is the one card with inputs that change independently of the
  // date range, so it keeps a standalone loader for grouping changes.
  const loadInventoryMovement = useCallback(async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      applyInventoryMovement(
        await getInventoryMovementWaterfall({
          from: timelineDateRange.from.toISOString(),
          to: timelineDateRange.to.toISOString(),
          group: inventoryGroup,
          category: inventoryCategory,
          size: inventorySize,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load inventory movements";
      setInventoryError(message);
    } finally {
      setInventoryLoading(false);
    }
  }, [
    timelineDateRange.from,
    timelineDateRange.to,
    inventoryGroup,
    inventoryCategory,
    inventorySize,
    applyInventoryMovement,
  ]);

  // Latest inventory grouping, read without making it a dependency of
  // `loadDashboard` — otherwise a grouping change would re-fetch all four
  // cards instead of just the waterfall. Synced in an effect declared ahead of
  // the loading effects below, so it is current by the time they run.
  const inventoryParamsRef = useRef({
    group: inventoryGroup,
    category: inventoryCategory,
    size: inventorySize,
  });
  useEffect(() => {
    inventoryParamsRef.current = {
      group: inventoryGroup,
      category: inventoryCategory,
      size: inventorySize,
    };
  }, [inventoryGroup, inventoryCategory, inventorySize]);

  /**
   * Single round trip for the whole retrospective. Next.js runs server actions
   * from one client sequentially, so issuing these four separately cost four
   * consecutive round trips on first paint; `getAnalyticsDashboard` runs them
   * concurrently on the server behind one admin check. Every loading and error
   * state below is the same one the four separate loaders set.
   */
  const loadDashboard = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setTimelineLoading(true);
        setMpMetricsLoading(true);
      } else {
        setTimelineRefreshing(true);
        setMpMetricsRefreshing(true);
      }
      // Margin and waterfall have no separate "refreshing" indicator; they show
      // their loading state on refresh too, exactly as they did before.
      setRealizedMarginLoading(true);
      setInventoryLoading(true);
      setTimelineError(null);
      setMpMetricsError(null);
      setRealizedMarginError(null);
      setInventoryError(null);

      const { group, category, size } = inventoryParamsRef.current;

      try {
        const res = await getAnalyticsDashboard({
          from: timelineDateRange.from.toISOString(),
          to: timelineDateRange.to.toISOString(),
          channel,
          group,
          category,
          size,
        });

        applySlice(res.timeline, applyTimeline, "Failed to load sales timeline", setTimelineError);
        applySlice(res.metrics, applyMpMetrics, "Failed to load mp-config metrics", (message) => {
          setMpMetricsError(message);
          setMpMetrics([]);
        });
        applySlice(res.margin, applyRealizedMargin, "Failed to load realized margin", (message) => {
          setRealizedMarginError(message);
          setRealizedMargin(null);
        });
        applySlice(
          res.waterfall,
          applyInventoryMovement,
          "Failed to load inventory movements",
          setInventoryError
        );
      } catch (err) {
        // The round trip itself failed: every card reports it, as before.
        const message = err instanceof Error ? err.message : "Failed to load analytics";
        setTimelineError(message);
        setMpMetricsError(message);
        setMpMetrics([]);
        setRealizedMarginError(message);
        setRealizedMargin(null);
        setInventoryError(message);
      } finally {
        if (mode === "initial") {
          setTimelineLoading(false);
          setMpMetricsLoading(false);
        } else {
          setTimelineRefreshing(false);
          setMpMetricsRefreshing(false);
        }
        setRealizedMarginLoading(false);
        setInventoryLoading(false);
      }
    },
    [
      timelineDateRange.from,
      timelineDateRange.to,
      channel,
      applyTimeline,
      applyMpMetrics,
      applyRealizedMargin,
      applyInventoryMovement,
    ]
  );

  // Identifies the waterfall inputs whose data has already been requested.
  const inventoryKey = `${inventoryGroup}|${inventoryCategory ?? ""}|${inventorySize ?? ""}`;
  const requestedInventoryKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Claim the current grouping before the effect below runs, so the combined
    // call is not immediately duplicated by a standalone waterfall fetch.
    requestedInventoryKeyRef.current = inventoryKey;
    void loadDashboard("initial");
    // `inventoryKey` is deliberately not a dependency: a grouping change is
    // served by the narrower effect below, not by a full dashboard reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDashboard]);

  useEffect(() => {
    if (requestedInventoryKeyRef.current === inventoryKey) return;
    requestedInventoryKeyRef.current = inventoryKey;
    void loadInventoryMovement();
  }, [inventoryKey, loadInventoryMovement]);

  const categorySummary = useMemo<CategorySummary[]>(() => {
    const map = new Map<string, CategorySummary>();
    for (const item of items) {
      const soldUnits = soldUnitsByItemId.get(item.id) ?? 0;
      if (soldUnits <= 0) continue;

      const label = CATEGORY_LABELS[item.category] ?? humanize(item.category);
      const current = map.get(item.category) ?? {
        category: item.category,
        label,
        totalItems: 0,
        pricedItems: 0,
        totalOnHand: 0,
        costValue: 0,
        msrpValue: 0,
        marginValue: 0,
        weightedMarginPct: null,
        markupPct: null,
      };

      current.totalItems += 1;
      current.totalOnHand += soldUnits;
      current.costValue += (item.cost ?? 0) * soldUnits;
      current.msrpValue += (item.msrp ?? 0) * soldUnits;
      if (item.cost !== null && item.msrp !== null) {
        current.pricedItems += 1;
      }

      map.set(item.category, current);
    }

    return Array.from(map.values())
      .map((entry) => {
        const marginValue = Math.max(0, entry.msrpValue - entry.costValue);
        const weightedMarginPct = entry.msrpValue > 0 ? (marginValue / entry.msrpValue) * 100 : null;
        const markupPct = entry.costValue > 0 ? (marginValue / entry.costValue) * 100 : null;
        return {
          ...entry,
          marginValue,
          weightedMarginPct,
          markupPct,
        };
      })
      .sort((a, b) => {
        const orderA = CATEGORY_ORDER.indexOf(a.category);
        const orderB = CATEGORY_ORDER.indexOf(b.category);
        if (orderA === -1 && orderB === -1) return a.label.localeCompare(b.label);
        if (orderA === -1) return 1;
        if (orderB === -1) return -1;
        return orderA - orderB;
      });
  }, [items, soldUnitsByItemId]);

  const marginChartData = useMemo<CategoryStackDatum[]>(
    () =>
      categorySummary
        .filter((entry) => entry.pricedItems > 0 && entry.weightedMarginPct !== null)
        .map((entry) => ({
          category: entry.category,
          label: entry.label,
          costValue: entry.costValue,
          msrpValue: entry.msrpValue,
          pricedItems: entry.pricedItems,
          totalOnHand: entry.totalOnHand,
          weightedMarginPct: entry.weightedMarginPct,
        })),
    [categorySummary]
  );
  const partValueData = useMemo<ItemStackDatum[]>(
    () =>
      items
        .filter((item) => item.cost !== null && item.msrp !== null)
        .map((item) => {
          const onHand = soldUnitsByItemId.get(item.id) ?? 0;
          if (onHand <= 0) return null;
          const cost = item.cost ?? 0;
          const msrp = item.msrp ?? 0;
          const costValue = cost * onHand;
          const msrpValue = msrp * onHand;
          return {
            id: item.id,
            category: item.category,
            label: describeItem(item),
            onHand,
            cost,
            msrp,
            costValue,
            msrpValue,
          };
        })
        .filter((row): row is ItemStackDatum => Boolean(row)),
    [items, soldUnitsByItemId]
  );

  const itemCostsForProducts = useMemo(() => items.map((it) => ({ id: it.id, cost: it.cost })), [items]);

  const timelineData = useMemo(
    () => (timelineView === "parts" ? partsTimeline : productsTimeline),
    [partsTimeline, productsTimeline, timelineView]
  );

  const timelineCard = (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
        <CardTitle>Product sales timeline</CardTitle>
        <CardDescription>
          {timelineView === "products"
            ? "Timeline view of different products being sold over time."
            : "Timeline view of parts sold by category over time."}
        </CardDescription>
        <CardAction className="col-start-1 row-start-3 w-full sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:w-auto">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            <Tabs value={timelineView} onValueChange={(v) => setTimelineView(v as "parts" | "products")} className="w-full sm:w-auto">
              <TabsList className="w-full sm:w-fit">
                <TabsTrigger value="parts">Parts</TabsTrigger>
                <TabsTrigger value="products">Products</TabsTrigger>
              </TabsList>
            </Tabs>

            <Tabs value={timelineMetric} onValueChange={(v) => setTimelineMetric(v as "units" | "revenue")} className="w-full sm:w-auto">
              <TabsList className="w-full sm:w-fit">
                <TabsTrigger value="units">Units</TabsTrigger>
                <TabsTrigger value="revenue">Revenue</TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => loadTimeline("refresh")}
              disabled={timelineRefreshing || timelineLoading}
              title="Refresh sales"
            >
              <RefreshCw className={timelineRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {timelineLoading ? (
          <Skeleton className="h-[320px] w-full rounded-xl" />
        ) : timelineError ? (
          <p className="text-sm text-muted-foreground">{timelineError}</p>
        ) : timelineData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales data available for the selected period.</p>
        ) : (
          <ProductTimelineVisx
            products={timelineData}
            viewMode={timelineView}
            dateRange={timelineDateRange}
            metric={timelineMetric}
            currency={timelineCurrency}
          />
        )}
      </CardContent>
    </Card>
  );

  const mpMetricsCard = (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
        <CardTitle>Results</CardTitle>
        <CardDescription>Mp-config answer breakdown from released results (final responses) in the selected date range.</CardDescription>
        <CardAction className="col-start-1 row-start-3 w-full sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:w-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => loadMpMetrics("refresh")}
            disabled={mpMetricsRefreshing || mpMetricsLoading}
            title="Refresh mp-config metrics"
          >
            <RefreshCw className={mpMetricsRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        {mpMetricsLoading ? (
          <Skeleton className="h-[320px] w-full rounded-xl" />
        ) : mpMetricsError ? (
          <p className="text-sm text-muted-foreground">{mpMetricsError}</p>
        ) : mpMetrics.length === 0 || mpMetrics.every((m) => (m.total ?? 0) <= 0) ? (
          <p className="text-sm text-muted-foreground">No released mp-config answers in the selected period.</p>
        ) : (
          <MpConfigMetricsStackedBarVisx metrics={mpMetrics} />
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1>Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Retrospective channel P&L from paid Orders and the Shopify order mirror.
            </p>
          </div>
          <Button disabled>Loading…</Button>
        </div>
        <Skeleton className="h-[120px] rounded-xl" />
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
    );
  }

  const channelLabel =
    channel === "all" ? "All channels" : channel === "orders" ? "Orders" : "Shopify";

  const refreshRetrospective = () => {
    void load("refresh");
    // One round trip covers the timeline, mp-config metrics, realized margin
    // and inventory waterfall; `load` is a direct Supabase query so it runs in
    // parallel with it rather than queueing behind the server action.
    void loadDashboard("refresh");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1>Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Retrospective channel P&L from paid Orders and the Shopify order mirror.
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <Tabs
            value={channel}
            onValueChange={(v) => setChannel(v as AnalyticsChannel)}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="shopify">Shopify</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            onClick={refreshRetrospective}
            disabled={refreshing || timelineRefreshing || mpMetricsRefreshing || realizedMarginLoading || inventoryLoading}
          >
            {refreshing || timelineRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Unable to load analytics</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button onClick={() => load("initial")}>Try again</Button>
            <Button variant="secondary" onClick={refreshRetrospective} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Retry silently"}
            </Button>
          </CardContent>
        </Card>
      )}

      <ProspectJourneyCard
        from={timelineDateRange.from.toISOString()}
        to={timelineDateRange.to.toISOString()}
      />

      <ProductConfigurationCard />

      <div className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Realized margin</h2>
          <p className="text-sm text-muted-foreground">
            {channelLabel}: paid sales in the selected date range, net of refunds.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="space-y-1">
              <CardDescription>Realized gross margin (sold)</CardDescription>
              <CardTitle className="text-2xl">
                {realizedMarginLoading ? (
                  <Skeleton className="h-8 w-28" />
                ) : realizedMarginError ? (
                  "—"
                ) : (
                  currencyFormatter.format(realizedMargin?.gross_margin ?? 0)
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {realizedMarginError
                ? realizedMarginError
                : realizedMarginLoading
                  ? "Loading sold-order margin…"
                  : `${realizedMargin?.order_count ?? 0} orders; product revenue net of refunds minus COGS.`}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="space-y-1">
              <CardDescription>Realized margin %</CardDescription>
              <CardTitle className="text-2xl">
                {realizedMarginLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : realizedMarginError ? (
                  "—"
                ) : (
                  formatPercent(realizedMargin?.margin_pct ?? null)
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {realizedMarginError
                ? realizedMarginError
                : realizedMarginLoading
                  ? "Loading sold-order margin…"
                  : "Gross margin as a share of adjusted product revenue after refunds."}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6">
        <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
          <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
            <CardTitle>{marginView === "products" ? "Margin by product" : "Margin by category"}</CardTitle>
            <CardDescription>
              {marginView === "products"
                ? "Shows cost vs margin value by pillow product over the selected date range (units sold)."
                : "Shows cost vs margin value by part category over the selected date range (units sold), with drill-down into items."}
            </CardDescription>
            <CardAction className="col-start-1 row-start-3 w-full sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:w-auto">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <Tabs value={marginView} onValueChange={(v) => setMarginView(v as "parts" | "products")} className="w-full sm:w-auto">
                  <TabsList className="w-full sm:w-fit">
                    <TabsTrigger value="parts">Parts</TabsTrigger>
                    <TabsTrigger value="products">Products</TabsTrigger>
                  </TabsList>
                </Tabs>

                <Popover
                  open={isTimelineCalendarOpen}
                  onOpenChange={(open) => {
                    setIsTimelineCalendarOpen(open);
                    if (!open) setHoverTimelineDateEdge(null);
                  }}
                >
                  <PopoverAnchor asChild>
                    <div className="inline-flex min-h-11 w-full items-center gap-1 rounded-lg border bg-background p-1 sm:w-auto">
                      <CalendarIcon className="ml-1 h-4 w-4 text-muted-foreground" />
                      <button
                        type="button"
                        className={[
                          "inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium transition-colors",
                          (activeTimelineDateEdge === "from" && isTimelineCalendarOpen) || hoverTimelineDateEdge === "from"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        ].join(" ")}
                        onMouseEnter={() => setHoverTimelineDateEdge("from")}
                        onMouseLeave={() => setHoverTimelineDateEdge(null)}
                        onClick={() => {
                          setActiveTimelineDateEdge("from");
                          setIsTimelineCalendarOpen(true);
                        }}
                      >
                        {format(timelineDateRange.from, "MMM yyyy")}
                      </button>
                      <span className="px-1 text-muted-foreground">–</span>
                      <button
                        type="button"
                        className={[
                          "inline-flex min-h-11 items-center rounded-md px-2 text-xs font-medium transition-colors",
                          (activeTimelineDateEdge === "to" && isTimelineCalendarOpen) || hoverTimelineDateEdge === "to"
                            ? "bg-muted text-foreground"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        ].join(" ")}
                        onMouseEnter={() => setHoverTimelineDateEdge("to")}
                        onMouseLeave={() => setHoverTimelineDateEdge(null)}
                        onClick={() => {
                          setActiveTimelineDateEdge("to");
                          setIsTimelineCalendarOpen(true);
                        }}
                      >
                        {format(timelineDateRange.to, "MMM yyyy")}
                      </button>
                    </div>
                  </PopoverAnchor>
                  <PopoverContent className="w-auto p-0" align={isMobile ? "center" : "end"}>
                    <div className="border-b px-4 py-2 text-xs text-muted-foreground">
                      Editing {activeTimelineDateEdge === "from" ? "start" : "end"} date
                    </div>
                    <Calendar
                      mode="range"
                      selected={{ from: timelineDateRange.from, to: timelineDateRange.to }}
                      onSelect={handleTimelineDateRangeSelect}
                      numberOfMonths={isMobile ? 1 : 2}
                      defaultMonth={activeTimelineDateEdge === "from" ? timelineDateRange.from : timelineDateRange.to}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {marginView === "parts" && marginChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add cost price and MSRP data in Costings to unlock category-level margin analysis.
              </p>
            ) : marginView === "parts" ? (
              <MarginByCategoryVisx categories={marginChartData} items={partValueData} />
            ) : (
              <MarginByProductVisx
                itemCosts={itemCostsForProducts}
                pillowUnitsByKindSize={soldPillowUnitsByKindSize}
                pillowUnitsByTemplateId={soldPillowUnitsByTemplateId}
              />
            )}
          </CardContent>
        </Card>

        {timelineCard}
        {mpMetricsCard}
      </div>

      <div className="grid gap-6">
        <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
          <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
            <CardTitle>Inventory movement</CardTitle>
            <CardDescription>
              Waterfall comparison between start vs end quantities. Click a part to drill into size, then type.
            </CardDescription>
            <CardAction className="col-start-1 row-start-3 w-full sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:w-auto">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                {(inventoryGroup === "size" || inventoryGroup === "type") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (inventoryGroup === "type") {
                        setInventoryGroup("size");
                        setInventorySize(null);
                        return;
                      }
                      setInventoryGroup("category");
                      setInventoryCategory(null);
                      setInventorySize(null);
                    }}
                  >
                    Back
                  </Button>
                )}
                <div className="max-w-full text-xs text-muted-foreground">
                  {inventoryGroup === "category"
                    ? "Parts"
                    : inventoryGroup === "size"
                      ? `Parts / ${CATEGORY_LABELS[inventoryCategory ?? ""] ?? humanize(inventoryCategory ?? "Category")}`
                      : `Parts / ${CATEGORY_LABELS[inventoryCategory ?? ""] ?? humanize(inventoryCategory ?? "Category")} / ${
                          inventorySize ?? "Size"
                        }`}
                </div>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            {inventoryLoading ? (
              <Skeleton className="h-[380px] w-full rounded-xl" />
            ) : inventoryError ? (
              <p className="text-sm text-muted-foreground">{inventoryError}</p>
            ) : inventoryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No inventory movement data available for the selected period.</p>
            ) : (
              <InventoryMovementWaterfallVisx
                rows={inventoryRows}
                onLabelClick={(row) => {
                  if (row.key === "__total_start__" || row.key === "__total_end__") return;
                  if (inventoryGroup === "category") {
                    setInventoryGroup("size");
                    setInventoryCategory(row.key);
                    setInventorySize(null);
                    return;
                  }
                  if (inventoryGroup === "size") {
                    setInventoryGroup("type");
                    setInventorySize(row.key);
                    return;
                  }
                }}
                isLabelClickable={(row) =>
                  inventoryGroup !== "type" && row.key !== "__total_start__" && row.key !== "__total_end__"
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

