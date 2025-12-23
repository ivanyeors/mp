"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
  LabelList,
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
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
  msrpValue: { label: "Potential revenue", color: "hsl(217 92% 69%)" },
};

const scatterChartConfig = {
  marginOpportunity: { label: "Per-item gross margin", color: "hsl(217 85% 55%)" },
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

  const marginChartData = useMemo(
    () =>
      categorySummary
        .filter((entry) => entry.pricedItems > 0 && entry.weightedMarginPct !== null)
        .map((entry) => ({
          label: entry.label,
          marginPct: entry.weightedMarginPct ?? 0,
          marginValue: entry.marginValue,
          pricedItems: entry.pricedItems,
        })),
    [categorySummary]
  );

  const inventoryValueData = useMemo(
    () =>
      categorySummary
        .filter((entry) => entry.costValue > 0 || entry.msrpValue > 0)
        .map((entry) => ({
          label: entry.label,
          costValue: entry.costValue,
          msrpValue: entry.msrpValue,
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

  const topOpportunities = useMemo(
    () =>
      [...itemOpportunityData]
        .filter((item) => item.opportunityValue > 0)
        .sort((a, b) => b.opportunityValue - a.opportunityValue)
        .slice(0, 3),
    [itemOpportunityData]
  );

  const suggestions = useMemo(() => {
    const signals: string[] = [];
    const futureCharts: string[] = [
      "Overlay BOM component costs (cover, case, filling, packaging) in a stacked bar per pillow size to see which inputs consume the most gross margin.",
      "Chart cost inflation scenarios by applying ±5% sensitivity sliders to cost price and tracking the impact on category-level margin% in real time.",
      "Combine sales velocity (inventory_transactions) with margin % in a scatter to highlight items that move fast but earn thin contribution.",
      "Add a buildable-vs-on-hand timeline using product_buildable to forecast when high-margin SKUs risk stockouts.",
    ];

    if (totals.pricedItems === 0) {
      signals.push("No items have both cost price and MSRP yet—populate the Costings tab to unlock margin analytics.");
      return { signals, futureCharts };
    }

    const missingPricing = totals.totalItems - totals.pricedItems;
    if (missingPricing > 0) {
      signals.push(
        `${missingPricing} of ${totals.totalItems} active parts still lack either cost or MSRP. Close these gaps to prevent blind spots in gross margin tracking.`
      );
    }

    const rankedByMargin = categorySummary
      .filter((entry) => entry.pricedItems > 0 && entry.weightedMarginPct !== null)
      .sort((a, b) => (a.weightedMarginPct ?? 0) - (b.weightedMarginPct ?? 0));

    if (rankedByMargin.length > 0) {
      const weakest = rankedByMargin[0];
      signals.push(
        `${weakest.label} is delivering only ${formatPercent(weakest.weightedMarginPct)} margin on stocked units—double-check cost inputs and consider repricing before the next purchase cycle.`
      );

      const strongest = rankedByMargin[rankedByMargin.length - 1];
      if (strongest.category !== weakest.category && strongest.weightedMarginPct !== null) {
        signals.push(
          `${strongest.label} leads with ${formatPercent(
            strongest.weightedMarginPct
          )} margin; keep allocations high here while the market will bear current pricing.`
        );
      }
    }

    const richestCategory = categorySummary
      .filter((entry) => entry.marginValue > 0)
      .sort((a, b) => b.marginValue - a.marginValue)[0];
    if (richestCategory) {
      signals.push(
        `${richestCategory.label} holds ${currencyFormatter.format(
          richestCategory.marginValue
        )} of unrealized gross margin sitting in inventory today.`
      );
    }

    if (topOpportunities.length > 0) {
      const focus = topOpportunities[0];
      signals.push(
        `${focus.label} (${focus.category}) ties up ${currencyFormatter.format(
          focus.opportunityValue
        )} of gross margin across ${focus.onHand} units. Prioritize sell-through or a targeted promo to convert it.`
      );
    }

    if (totals.pricingCoveragePct !== null) {
      signals.push(
        `Pricing visibility covers ${formatPercent(totals.pricingCoveragePct)} of active SKUs. Aim for >95% to make the analytics trustworthy.`
      );
    }

    return { signals, futureCharts };
  }, [
    categorySummary,
    currencyFormatter,
    formatPercent,
    topOpportunities,
    totals.pricedItems,
    totals.pricingCoveragePct,
    totals.totalItems,
  ]);

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

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Margin by category</CardTitle>
            <CardDescription>Weighted by current MSRP value; highlights where margin is thinnest.</CardDescription>
          </CardHeader>
          <CardContent>
            {marginChartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add cost price and MSRP data in Costings to unlock category-level margin analysis.
              </p>
            ) : (
              <ChartContainer className="min-h-[320px] w-full" config={marginChartConfig}>
                <BarChart data={marginChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                    domain={[0, (dataMax: number) => Math.max(60, Math.ceil(dataMax / 10) * 10)]}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="label"
                        formatter={(value, _name, item) => (
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{`${Number(value).toFixed(1)}% margin`}</span>
                            <span className="text-xs text-muted-foreground">
                              Gross margin pool: {currencyFormatter.format(item?.payload?.marginValue ?? 0)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Priced SKUs: {item?.payload?.pricedItems ?? 0}
                            </span>
                          </div>
                        )}
                      />
                    }
                  />
                  <ReferenceLine y={40} stroke="var(--border)" strokeDasharray="4 4" label={{ value: "40% target", position: "top" }} />
                  <Bar dataKey="marginPct" radius={[6, 6, 0, 0]} fill="var(--color-marginPct)">
                    <LabelList
                      dataKey="marginPct"
                      position="top"
                      formatter={(value: number) => `${value.toFixed(0)}%`}
                      className="text-xs font-medium"
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory value vs. MSRP</CardTitle>
            <CardDescription>Quantifies cost exposure and revenue upside by category.</CardDescription>
          </CardHeader>
          <CardContent>
            {inventoryValueData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Receive stock and record pricing to populate inventory value analytics.
              </p>
            ) : (
              <ChartContainer className="min-h-[320px] w-full" config={inventoryValueChartConfig}>
                <BarChart data={inventoryValueData} barGap={12} barCategoryGap={24}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) => compactCurrencyFormatter.format(value)}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelKey="label"
                        formatter={(value, name) => (
                          <div className="flex flex-col">
                            <span className="font-medium">{compactCurrencyFormatter.format(Number(value))}</span>
                            <span className="text-xs text-muted-foreground">{name}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar dataKey="costValue" fill="var(--color-costValue)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="msrpValue" fill="var(--color-msrpValue)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Margin vs. price positioning</CardTitle>
          <CardDescription>
            Visualizes each stocked SKU by unit cost and MSRP; bubble size reflects stock on hand.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itemOpportunityData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Capture cost and MSRP for individual items to spot outliers and mispriced SKUs.
            </p>
          ) : (
            <ChartContainer className="min-h-[360px] w-full" config={scatterChartConfig}>
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="cost"
                  name="Cost price"
                  tickFormatter={(value) => compactCurrencyFormatter.format(value)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="msrp"
                  name="MSRP"
                  tickFormatter={(value) => compactCurrencyFormatter.format(value)}
                  axisLine={false}
                  tickLine={false}
                />
                <ZAxis dataKey="bubbleSize" range={[6, 32]} />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelKey="label"
                      formatter={(_, __, item) => {
                        if (!item?.payload) return null;
                        return (
                          <div className="grid gap-1">
                            <div className="font-medium">{item.payload.label}</div>
                            <div className="text-xs text-muted-foreground">{item.payload.category}</div>
                            <Separator className="my-1" />
                            <div className="text-xs">
                              Cost: <span className="font-medium">{currencyFormatter.format(item.payload.cost)}</span>
                            </div>
                            <div className="text-xs">
                              MSRP: <span className="font-medium">{currencyFormatter.format(item.payload.msrp)}</span>
                            </div>
                            <div className="text-xs">
                              Unit margin:{" "}
                              <span className="font-medium">{currencyFormatter.format(item.payload.unitMargin)}</span>
                            </div>
                            <div className="text-xs">
                              Stocked units: <span className="font-medium">{item.payload.onHand}</span>
                            </div>
                            <div className="text-xs">
                              Margin %: <span className="font-medium">{formatPercent(item.payload.marginPct)}</span>
                            </div>
                            <div className="text-xs">
                              Margin tied up:{" "}
                              <span className="font-medium">
                                {currencyFormatter.format(item.payload.opportunityValue)}
                              </span>
                            </div>
                          </div>
                        );
                      }}
                    />
                  }
                />
                <Scatter data={itemOpportunityData} fill="var(--color-marginOpportunity)" />
              </ScatterChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Analyst recommendations</CardTitle>
          <CardDescription>Focus areas and next analytical layers to deepen visibility.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Current signals</h3>
            {suggestions.signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No margin signals yet—add inventory and pricing data.</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {suggestions.signals.map((signal, index) => (
                  <li key={`signal-${index}`}>{signal}</li>
                ))}
              </ul>
            )}
          </div>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Suggested next charts
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {suggestions.futureCharts.map((idea, index) => (
                <li key={`idea-${index}`}>{idea}</li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

