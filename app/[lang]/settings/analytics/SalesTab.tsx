"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sgMonthKey } from "@/lib/analytics/sg-calendar";
import { getSalesReport } from "./actions";

const MarginBreakdownVisx = dynamic(() => import("./MarginBreakdownVisx").then((m) => m.MarginBreakdownVisx), {
  ssr: false,
});
const ProductTimelineVisx = dynamic(() => import("./ProductTimelineVisx").then((m) => m.ProductTimelineVisx), {
  ssr: false,
});

type SalesReport = Awaited<ReturnType<typeof getSalesReport>>;

const currency = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("en-SG");

function pct(value: number | null): string {
  return value == null || Number.isNaN(value) ? "—" : `${value.toFixed(1)}%`;
}

/** A server month instant as a local Date on that month's 1st, whatever the browser's timezone. */
function localMonth(iso: string): Date {
  const [y, m] = sgMonthKey(iso).split("-").map(Number);
  return new Date(y, m - 1, 1);
}

function Kpi({ label, value, note, loading }: { label: string; value: string; note: string; loading: boolean }) {
  return (
    <Card className="min-w-0 gap-2 py-4">
      <CardHeader className="gap-1 px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{loading ? <Skeleton className="h-8 w-24" /> : value}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 text-xs text-muted-foreground">{note}</CardContent>
    </Card>
  );
}

/**
 * Sales & margin: realised revenue, COGS frozen at sale, and the margin between
 * them. Every figure here is summed from the same sold lines, so the cards,
 * the breakdown and the timeline agree, and a sale with no cost is reported as
 * such instead of as profit.
 */
export function SalesTab({ from, to, dateRange }: { from: string; to: string; dateRange: { from: Date; to: Date } }) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdownView, setBreakdownView] = useState<"products" | "parts">("products");
  const [timelineView, setTimelineView] = useState<"products" | "parts">("products");
  const [timelineMetric, setTimelineMetric] = useState<"units" | "revenue">("revenue");
  const [showAllGaps, setShowAllGaps] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getSalesReport({ from, to }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load sales.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const timeline = useMemo(() => {
    if (!report) return [];
    const series = timelineView === "products" ? report.timeline.products : report.timeline.parts;
    return series.map((s) => ({
      ...s,
      data: s.data.map((pt) => ({ date: localMonth(pt.date), units: pt.units, revenue: pt.revenue })),
    }));
  }, [report, timelineView]);

  const s = report?.summary;
  const gaps = report?.gaps ?? [];
  const shownGaps = showAllGaps ? gaps : gaps.slice(0, 8);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-muted-foreground">
            Orders on this site, counted when Stripe took the payment. Net of discounts and refunds, before shipping
            and tax.
          </p>
          <InfoTip label="About when a sale counts">
            A sale is dated by Stripe&apos;s own time for the payment, read from the payment ledger: the moment the whole
            price was in. An order paid in two parts counts when the second part lands. Refunds and lost disputes come
            off the sale they belong to.
          </InfoTip>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} title="Refresh sales">
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-destructive">Couldn&apos;t load sales</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void load()}>Try again</Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Revenue"
          loading={loading}
          value={currency.format(s?.revenue ?? 0)}
          note={
            s && s.orderCount > 0
              ? `${integer.format(s.orderCount)} orders paid through Stripe.`
              : "No orders paid through Stripe in this period yet."
          }
        />
        <Kpi
          label="Gross margin"
          loading={loading}
          value={currency.format(s?.grossMargin ?? 0)}
          note={`Costed revenue ${currency.format(s?.costedRevenue ?? 0)} minus COGS ${currency.format(s?.cogs ?? 0)}, both frozen at sale.`}
        />
        <Kpi
          label="Margin %"
          loading={loading}
          value={pct(s?.marginPct ?? null)}
          note="Gross margin as a share of costed revenue. Sales with no cost are left out, not counted as free."
        />
        <Kpi
          label="Cost coverage"
          loading={loading}
          value={pct(s?.coveragePct ?? null)}
          note={
            s && s.uncostedRevenue > 0
              ? `${currency.format(s.uncostedRevenue)} of revenue on ${integer.format(s.uncostedLineCount)} lines has no cost. See below.`
              : s && s.orderCount > 0
                ? "Every sale in the period has a cost."
                : "Nothing sold in this period to cost."
          }
        />
      </div>

      {!loading && gaps.length > 0 && (
        <Card className="min-w-0 gap-4 py-4 sm:gap-5 sm:py-6">
          <CardHeader className="px-4 sm:px-6">
            <div className="flex items-center gap-1.5">
              <CardTitle>Sales with no cost</CardTitle>
              <InfoTip label="About sales with no cost">
                A sale keeps the cost recorded on its order lines when it sold. A line with none stays out of the margin
                rather than counting as free.
              </InfoTip>
            </div>
            <CardDescription>
              {currency.format(s?.uncostedRevenue ?? 0)} of revenue is left out of the margin until these have a cost.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm sm:min-w-[560px]">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Sold as</th>
                    <th className="py-2 pr-3 font-medium">Why it has no cost</th>
                    <th className="py-2 pr-3 text-right font-medium">Units</th>
                    <th className="py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {shownGaps.map((g) => (
                    <tr key={`${g.key}|${g.reason}`} className="border-b align-top last:border-0">
                      <td className="py-1.5 pr-3">{g.label}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{g.reason}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{integer.format(g.units)}</td>
                      <td className="py-1.5 text-right tabular-nums">{currency.format(g.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {gaps.length > 8 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAllGaps((v) => !v)}>
                {showAllGaps ? "Show fewer" : `Show all ${gaps.length}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0 gap-4 py-4 sm:gap-6 sm:py-6">
        <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
          <div className="flex items-center gap-1.5">
            <CardTitle>Margin by {breakdownView === "products" ? "product" : "part"}</CardTitle>
            <InfoTip label="About margin breakdown">
              Revenue each line earned against the cost of what it shipped. Products are pillows and bolsters by size or
              length; parts are Items sold on their own, by category, and services.
            </InfoTip>
          </div>
          <CardAction>
            <Tabs value={breakdownView} onValueChange={(v) => setBreakdownView(v as "products" | "parts")}>
              <TabsList>
                <TabsTrigger value="products">Products</TabsTrigger>
                <TabsTrigger value="parts">Parts</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardAction>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {loading ? (
            <Skeleton className="h-[320px] w-full rounded-xl" />
          ) : (
            <MarginBreakdownVisx
              key={breakdownView}
              rows={(breakdownView === "products" ? report?.products : report?.parts) ?? []}
              emptyText={
                breakdownView === "products" ? "No pillows or bolsters sold in this period." : "No parts or services sold in this period."
              }
              drillHint={
                breakdownView === "products"
                  ? "Click a product to see each size or length."
                  : "Click a category to see its Items."
              }
              drillTitle={(key) =>
                key.startsWith("pillow:") ? "by size" : key === "bolster" ? "by length" : key === "unmapped" ? "by line" : "by item"
              }
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 gap-4 py-4 sm:gap-6 sm:py-6">
        <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
          <div className="flex items-center gap-1.5">
            <CardTitle>Sales over time</CardTitle>
            <InfoTip label="About sales over time">
              Units or revenue each month, by Singapore calendar month. The four biggest lines are drawn on their own; the
              rest are added up into one.
            </InfoTip>
          </div>
          <CardAction>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Tabs value={timelineView} onValueChange={(v) => setTimelineView(v as "products" | "parts")}>
                <TabsList>
                  <TabsTrigger value="products">Products</TabsTrigger>
                  <TabsTrigger value="parts">Parts</TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs value={timelineMetric} onValueChange={(v) => setTimelineMetric(v as "units" | "revenue")}>
                <TabsList>
                  <TabsTrigger value="revenue">Revenue</TabsTrigger>
                  <TabsTrigger value="units">Units</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {loading ? (
            <Skeleton className="h-[320px] w-full rounded-xl" />
          ) : timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sales in this period.</p>
          ) : (
            <ProductTimelineVisx
              products={timeline}
              viewMode={timelineView}
              dateRange={dateRange}
              metric={timelineMetric}
              currency="SGD"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
