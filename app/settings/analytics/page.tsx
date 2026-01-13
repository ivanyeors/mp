"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { ProductConfigurationCard } from "./ProductConfigurationCard";
import { MarginByCategoryVisx } from "./MarginByCategoryVisx";
import type { CategoryStackDatum, ItemStackDatum } from "./MarginByCategoryVisx";
import { MarginByProductVisx } from "./MarginByProductVisx";
import { PillowHeatmap } from "./PillowHeatmap";
import { UnitMarginBySkuVisx } from "./UnitMarginBySkuVisx";
import { ProductTimelineVisx } from "./ProductTimelineVisx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

type PriceRecord = { cost_price: string | number | null; msrp: string | number | null };

type RawItemRow = {
  id: number;
  category: string;
  name: string;
  size: string | null;
  subtype: string | null;
  pricing?: PriceRecord | PriceRecord[] | null;
};

type BalanceRow = { item_id: number; on_hand: string | number | null };

type ItemMetrics = {
  id: number;
  category: string;
  name: string;
  size: string | null;
  subtype: string | null;
  cost: number | null;
  msrp: number | null;
  onHand: number;
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
  case: "Pillow Cases",
  protector: "Protectors",
  filling: "Fillings",
  packaging: "Packaging",
  accessories: "Accessories",
  other: "Other",
};

const CATEGORY_ORDER = ["cover", "case", "protector", "filling", "packaging", "accessories", "other"];

const marginChartConfig = {
  marginPct: { label: "Weighted gross margin %", color: "hsl(217 91% 60%)" },
};

const inventoryValueChartConfig = {
  costValue: { label: "Inventory at cost", color: "hsl(217 80% 45%)" },
  marginValue: { label: "MSRP − cost", color: "hsl(142 76% 36%)" },
};

const unitMarginChartConfig = {
  unitMargin: { label: "MSRP − cost (unit)", color: "hsl(142 76% 36%)" },
};

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

export default function AnalyticsPage() {
  const [items, setItems] = useState<ItemMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marginView, setMarginView] = useState<"parts" | "products">("parts");
  const [timelineView, setTimelineView] = useState<"parts" | "products">("parts");
  const [timelineDateRange, setTimelineDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(subMonths(new Date(), 5)),
    to: endOfMonth(new Date()),
  });
  const [isTimelineCalendarOpen, setIsTimelineCalendarOpen] = useState(false);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }),
    []
  );

  const compactCurrencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    []
  );

  const formatPercent = useCallback((value: number | null) => {
    if (value === null || Number.isNaN(value)) return "—";
    return `${value.toFixed(1)}%`;
  }, []);

  const handleTimelineDateRangeSelect = useCallback((range: { from?: Date; to?: Date } | undefined) => {
    if (range?.from && range?.to) {
      setTimelineDateRange({
        from: startOfMonth(range.from),
        to: endOfMonth(range.to),
      });
      setIsTimelineCalendarOpen(false);
    }
  }, []);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const [{ data: itemRows, error: itemsError }, { data: balanceRows, error: balancesError }] = await Promise.all([
          supabaseClient
            .from("items")
            .select("id,category,name,size,subtype,pricing:item_prices(cost_price,msrp)")
            .eq("is_active", true),
          supabaseClient.from("inventory_balances").select("item_id,on_hand"),
        ]);

        if (itemsError) {
          throw new Error(itemsError.message);
        }
        if (balancesError) {
          throw new Error(balancesError.message);
        }

        const balanceMap = new Map<number, number>();
        (balanceRows ?? []).forEach((row: BalanceRow) => {
          const quantity = toNumber(row.on_hand) ?? 0;
          balanceMap.set(row.item_id, quantity);
        });

        const nextItems = (itemRows ?? []).map((row: RawItemRow) => {
          const pricing = Array.isArray(row.pricing) ? row.pricing[0] : row.pricing;
          const cost = toNumber(pricing?.cost_price);
          const msrp = toNumber(pricing?.msrp);
          const onHand = balanceMap.get(row.id) ?? 0;
          return {
            id: row.id,
            category: row.category,
            name: row.name,
            size: row.size,
            subtype: row.subtype,
            cost,
            msrp,
            onHand,
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

  const totals = useMemo(() => {
    const costValue = items.reduce((sum, item) => sum + (item.cost ?? 0) * Math.max(item.onHand, 0), 0);
    const msrpValue = items.reduce((sum, item) => sum + (item.msrp ?? 0) * Math.max(item.onHand, 0), 0);
    const marginValue = Math.max(0, msrpValue - costValue);
    const pricedItems = items.filter((item) => item.cost !== null && item.msrp !== null).length;
    const totalItems = items.length;
    const weightedMarginPct = msrpValue > 0 ? (marginValue / msrpValue) * 100 : null;
    const markupPct = costValue > 0 ? (marginValue / costValue) * 100 : null;

    return {
      costValue,
      msrpValue,
      marginValue,
      pricedItems,
      totalItems,
      weightedMarginPct,
      markupPct,
      pricingCoveragePct: totalItems > 0 ? (pricedItems / totalItems) * 100 : null,
    };
  }, [items]);

  const categorySummary = useMemo<CategorySummary[]>(() => {
    const map = new Map<string, CategorySummary>();
    for (const item of items) {
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
      current.totalOnHand += Math.max(item.onHand, 0);
      current.costValue += (item.cost ?? 0) * Math.max(item.onHand, 0);
      current.msrpValue += (item.msrp ?? 0) * Math.max(item.onHand, 0);
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
  }, [items]);

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
          const onHand = Math.max(item.onHand, 0);
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
        }),
    [items]
  );

  const itemCostsForProducts = useMemo(() => items.map((it) => ({ id: it.id, cost: it.cost })), [items]);

  const inventoryValueData = useMemo(
    () =>
      categorySummary
        .filter((entry) => entry.costValue > 0 || entry.msrpValue > 0)
        .map((entry) => ({
          label: entry.label,
          costValue: entry.costValue,
          marginValue: entry.marginValue,
          onHand: entry.totalOnHand,
        })),
    [categorySummary]
  );

  const itemOpportunityData = useMemo(
    () =>
      items
        .filter((item) => item.cost !== null && item.msrp !== null)
        .map((item) => {
          const unitMargin = (item.msrp ?? 0) - (item.cost ?? 0);
          const opportunityValue = unitMargin * Math.max(item.onHand, 0);
          const marginPct = item.msrp && item.msrp > 0 ? (unitMargin / item.msrp) * 100 : null;
          return {
            id: item.id,
            label: describeItem(item),
            category: CATEGORY_LABELS[item.category] ?? humanize(item.category),
            cost: item.cost ?? 0,
            msrp: item.msrp ?? 0,
            unitMargin,
            opportunityValue,
            marginPct,
            onHand: Math.max(item.onHand, 0),
            bubbleSize: Math.max(6, Math.sqrt(Math.max(item.onHand, 0)) * 3),
          };
        }),
    [items]
  );

  const unitMarginLeaderboardData = useMemo(() => {
    const formatted = [...itemOpportunityData]
      .map((item) => ({
        id: item.id,
        label: item.label,
        unitMargin: item.unitMargin,
        cost: item.cost,
        msrp: item.msrp,
        onHand: item.onHand,
        opportunityValue: item.opportunityValue,
      }))
      .sort((a, b) => b.unitMargin - a.unitMargin)
      .slice(0, 12);

    return formatted.reverse();
  }, [itemOpportunityData]);

  const unitMarginInsight = useMemo(() => {
    if (unitMarginLeaderboardData.length === 0) return null;
    const top = unitMarginLeaderboardData.reduce((best, row) => (row.unitMargin > best.unitMargin ? row : best), unitMarginLeaderboardData[0]);
    const bottom = unitMarginLeaderboardData.reduce((worst, row) => (row.unitMargin < worst.unitMargin ? row : worst), unitMarginLeaderboardData[0]);
    return {
      top,
      bottom,
      shown: unitMarginLeaderboardData.length,
    };
  }, [unitMarginLeaderboardData]);

  const timelineData = useMemo(() => {
    // Generate mock timeline data for demonstration
    // In production, this would fetch from shopify_sales_queue or a dedicated sales table
    const now = new Date();
    const months = 6;
    
    const CATEGORY_COLORS: Record<string, string> = {
      cover: "hsl(217 91% 60%)",
      case: "hsl(262 83% 58%)",
      protector: "hsl(142 76% 36%)",
      filling: "hsl(24 95% 53%)",
      packaging: "hsl(43 96% 56%)",
      accessories: "hsl(300 76% 42%)",
      other: "hsl(0 0% 60%)",
    };

    if (timelineView === "parts") {
      // Generate timeline for parts by category
      return categorySummary.map((category) => ({
        id: category.category,
        name: category.label,
        category: category.category,
        color: CATEGORY_COLORS[category.category] || "hsl(0 0% 60%)",
        data: Array.from({ length: months }, (_, i) => {
          const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
          // Generate mock data with some randomness based on category value
          const baseValue = category.costValue / months;
          const variation = Math.sin(i) * 0.3 + 1;
          return {
            date,
            value: Math.max(0, baseValue * variation * (0.7 + Math.random() * 0.6)),
            quantity: Math.floor(category.totalOnHand / months * variation * (0.7 + Math.random() * 0.6)),
          };
        }),
      }));
    } else {
      // Generate timeline for products
      // Mock product data - in production this would come from BOM configurations
      const products = [
        { id: "pillow-standard", name: "Standard Pillow", category: "pillow", baseValue: 5000 },
        { id: "pillow-premium", name: "Premium Pillow", category: "pillow", baseValue: 8000 },
        { id: "bolster-medium", name: "Medium Bolster", category: "bolster", baseValue: 3000 },
        { id: "bolster-large", name: "Large Bolster", category: "bolster", baseValue: 4500 },
      ];

      return products.map((product) => ({
        id: product.id,
        name: product.name,
        category: product.category,
        color: CATEGORY_COLORS[product.category] || "hsl(0 0% 60%)",
        data: Array.from({ length: months }, (_, i) => {
          const date = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
          const variation = Math.sin(i + product.baseValue) * 0.3 + 1;
          const value = Math.max(0, product.baseValue * variation * (0.6 + Math.random() * 0.8));
          return {
            date,
            value,
            quantity: Math.floor(value / 50),
            avgPrice: value / Math.max(1, Math.floor(value / 50)),
          };
        }),
      }));
    }
  }, [categorySummary, timelineView]);

  const timelineCard = (
    <Card>
      <CardHeader>
        <CardTitle>Product sales timeline</CardTitle>
        <CardDescription>
          {timelineView === "products"
            ? "Timeline view of different products being sold over time."
            : "Timeline view of parts sold by category over time."}
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Tabs value={timelineView} onValueChange={(v) => setTimelineView(v as "parts" | "products")}>
              <TabsList>
                <TabsTrigger value="parts">Parts</TabsTrigger>
                <TabsTrigger value="products">Products</TabsTrigger>
              </TabsList>
            </Tabs>

            <Popover open={isTimelineCalendarOpen} onOpenChange={setIsTimelineCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  {format(timelineDateRange.from, "MMM yyyy")} - {format(timelineDateRange.to, "MMM yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: timelineDateRange.from, to: timelineDateRange.to }}
                  onSelect={handleTimelineDateRangeSelect}
                  numberOfMonths={2}
                  defaultMonth={timelineDateRange.from}
                />
              </PopoverContent>
            </Popover>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {timelineData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales data available for the selected period.</p>
        ) : (
          <ProductTimelineVisx
            products={timelineData}
            viewMode={timelineView}
            onViewModeChange={setTimelineView}
            dateRange={timelineDateRange}
          />
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Margin and stock insights built from your costings and inventory balances.
            </p>
          </div>
          <Button disabled>Loading…</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[140px] rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[360px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Margin and stock insights built from your costings and inventory balances.
          </p>
        </div>
        <Button onClick={() => load("refresh")} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Unable to load analytics</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Button onClick={() => load("initial")}>Try again</Button>
            <Button variant="secondary" onClick={() => load("refresh")} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Retry silently"}
            </Button>
          </CardContent>
        </Card>
      )}

      <ProductConfigurationCard />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Inventory at cost</CardDescription>
            <CardTitle className="text-2xl">{currencyFormatter.format(totals.costValue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Across {totals.totalItems} active items; reflects on-hand cost exposure.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Potential revenue (MSRP)</CardDescription>
            <CardTitle className="text-2xl">{currencyFormatter.format(totals.msrpValue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Assumes every stocked unit sells at full list price.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Unrealized gross margin</CardDescription>
            <CardTitle className="text-2xl">{currencyFormatter.format(totals.marginValue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Difference between current MSRP value and cost basis.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="space-y-1">
            <CardDescription>Weighted gross margin %</CardDescription>
            <CardTitle className="text-2xl">{formatPercent(totals.weightedMarginPct)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Weighted by MSRP across all stocked SKUs with pricing coverage.
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{marginView === "products" ? "Margin by product" : "Margin by category"}</CardTitle>
            <CardDescription>
              {marginView === "products"
                ? "Estimated from BOM costs and buildable units; shows cost vs margin value by pillow product."
                : "Shows cost vs margin value by part category, with drill-down into items."}
            </CardDescription>
            <CardAction>
              <Tabs value={marginView} onValueChange={(v) => setMarginView(v as "parts" | "products")}>
                <TabsList>
                  <TabsTrigger value="parts">Parts</TabsTrigger>
                  <TabsTrigger value="products">Products</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardAction>
          </CardHeader>
          <CardContent>
            {marginView === "parts" && marginChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add cost price and MSRP data in Costings to unlock category-level margin analysis.
              </p>
            ) : marginView === "parts" ? (
              <MarginByCategoryVisx categories={marginChartData} items={partValueData} />
            ) : (
              <MarginByProductVisx itemCosts={itemCostsForProducts} />
            )}
          </CardContent>
        </Card>

        {timelineCard}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>SKU metrics</CardTitle>
            <CardDescription>
              Shows cost, MSRP, and on-hand inventory per SKU. Sorted by biggest unit margin, positive margins only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {unitMarginLeaderboardData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Capture cost and MSRP for individual items to see the per-unit difference.
              </p>
            ) : (
              <div className="space-y-3">
                {unitMarginInsight && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Top:</span> {unitMarginInsight.top.label}{" "}
                    <span className="font-medium">({compactCurrencyFormatter.format(unitMarginInsight.top.unitMargin)})</span>{" "}
                    <span className="mx-2">·</span>
                    <span className="font-medium">Bottom:</span> {unitMarginInsight.bottom.label}{" "}
                    <span className="font-medium">
                      ({compactCurrencyFormatter.format(unitMarginInsight.bottom.unitMargin)})
                    </span>
                    <span className="mx-2">·</span>
                    <span>Showing items with positive margins only. Hover bars for details.</span>
                  </div>
                )}
                <UnitMarginBySkuVisx
                  rows={unitMarginLeaderboardData}
                  formatMoney={(v) => compactCurrencyFormatter.format(v)}
                  formatMoneyLong={(v) => currencyFormatter.format(v)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Heatmap</CardTitle>
            <CardDescription>Pseudo intensity preview clipped to the pillow silhouette.</CardDescription>
          </CardHeader>
          <CardContent>
            <PillowHeatmap
              title="Heatmap"
              showTitle={false}
              seed={1337}
              palette={{ from: "hsl(221 83% 53%)", to: "hsl(188 94% 42%)" }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

