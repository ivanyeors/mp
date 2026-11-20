"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarIcon, RefreshCw } from "lucide-react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { partCategoryLabel } from "@/lib/analytics/sold-lines";
import { sgMonthRangeIso } from "@/lib/analytics/sg-calendar";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import {
  getInventoryMovementWaterfall,
  getMpConfigMetricsBreakdown,
  type InventoryMovementGroup,
  type InventoryMovementRow,
  type MpConfigMetricBreakdown,
} from "./actions";
import { SalesTab } from "./SalesTab";
import {
  ANALYTICS_TAB_LABELS,
  ANALYTICS_TAB_QUESTIONS,
  ANALYTICS_TABS,
  parseAnalyticsTab,
  type AnalyticsTab,
} from "./tabs";

const CardSkeleton = () => <div className="min-h-[360px] w-full animate-pulse rounded-xl bg-muted" />;
const ProductConfigurationCard = dynamic(() => import("./ProductConfigurationCard").then((m) => m.ProductConfigurationCard), { ssr: false, loading: CardSkeleton });
const ProspectJourneyCard = dynamic(() => import("./ProspectJourneyCard").then((m) => m.ProspectJourneyCard), { ssr: false, loading: CardSkeleton });
const SearchVisibilityCard = dynamic(() => import("./SearchVisibilityCard").then((m) => m.SearchVisibilityCard), { ssr: false, loading: CardSkeleton });
const DropOffReasonsCard = dynamic(() => import("./DropOffReasonsCard").then((m) => m.DropOffReasonsCard), { ssr: false, loading: CardSkeleton });
const UnsubscribeReasonsCard = dynamic(() => import("./UnsubscribeReasonsCard").then((m) => m.UnsubscribeReasonsCard), { ssr: false, loading: CardSkeleton });
const InventoryMovementWaterfallVisx = dynamic(() => import("./InventoryMovementWaterfallVisx").then((m) => m.InventoryMovementWaterfallVisx), { ssr: false });
const MpConfigMetricsStackedBarVisx = dynamic(() => import("./MpConfigMetricsStackedBarVisx").then((m) => m.MpConfigMetricsStackedBarVisx), { ssr: false });

type Period = { from: string; to: string; dateRange: { from: Date; to: Date } };

function periodOf(range: { from: Date; to: Date }): Period {
  const iso = sgMonthRangeIso(format(range.from, "yyyy-MM"), format(range.to, "yyyy-MM"));
  return { ...iso, dateRange: range };
}

function PeriodPicker({
  value,
  onChange,
}: {
  value: { from: Date; to: Date };
  onChange: (next: { from: Date; to: Date }) => void;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [edge, setEdge] = useState<"from" | "to">("to");

  const select = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range?.from && !range?.to) return;
    const changedFrom = range.from && range.from.getTime() !== value.from.getTime() ? range.from : null;
    const changedTo = range.to && range.to.getTime() !== value.to.getTime() ? range.to : null;
    const picked =
      edge === "from" ? (changedFrom ?? changedTo ?? range.from ?? range.to) : (changedTo ?? changedFrom ?? range.to ?? range.from);
    if (!picked) return;
    let from = value.from;
    let to = value.to;
    if (edge === "from") {
      from = startOfMonth(picked);
      if (from > to) to = endOfMonth(from);
    } else {
      to = endOfMonth(picked);
      if (to < from) from = startOfMonth(to);
    }
    onChange({ from, to });
    setOpen(false);
  };

  const edgeButton = (which: "from" | "to") => (
    <button
      type="button"
      className={[
        "inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors active:bg-press sm:flex-none",
        open && edge === which ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      ].join(" ")}
      onClick={() => {
        setEdge(which);
        setOpen(true);
      }}
    >
      {format(which === "from" ? value.from : value.to, "MMM yyyy")}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="inline-flex min-h-11 w-full items-center gap-1 rounded-lg border bg-background p-1 sm:w-auto">
          <CalendarIcon className="ml-1 h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="sr-only">Period</span>
          {edgeButton("from")}
          <span className="px-1 text-muted-foreground">to</span>
          {edgeButton("to")}
        </div>
      </PopoverAnchor>
      <PopoverContent className="w-auto p-0" align={isMobile ? "center" : "end"}>
        <div className="border-b px-4 py-2 text-xs text-muted-foreground">
          Editing {edge === "from" ? "first" : "last"} month
        </div>
        <Calendar
          mode="range"
          selected={{ from: value.from, to: value.to }}
          onSelect={select}
          numberOfMonths={isMobile ? 1 : 2}
          defaultMonth={edge === "from" ? value.from : value.to}
        />
      </PopoverContent>
    </Popover>
  );
}

function StockTab({ period, costingsHref }: { period: Period; costingsHref: string }) {
  const [rows, setRows] = useState<InventoryMovementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<InventoryMovementGroup>("category");
  const [category, setCategory] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getInventoryMovementWaterfall({ from: period.from, to: period.to, group, category, size });
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load inventory movements.");
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to, group, category, size]);

  useEffect(() => {
    void load();
  }, [load]);

  const crumb =
    group === "category"
      ? "All parts"
      : group === "size"
        ? `Parts / ${partCategoryLabel(category ?? "other")}`
        : `Parts / ${partCategoryLabel(category ?? "other")} / ${size ?? "Size"}`;

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card className="min-w-0 gap-4 py-4 sm:gap-6 sm:py-6">
        <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
          <div className="flex items-center gap-1.5">
            <CardTitle>Inventory movement</CardTitle>
            <InfoTip label="About Inventory movement">
              Opening stock, what came in and went out by category, and closing stock, from every movement in the stock
              ledger. The closing figure for this month matches the Inventory page. Click a category to drill into size,
              then type.
            </InfoTip>
          </div>
          <CardAction>
            <div className="flex items-center gap-2">
              {(group === "size" || group === "type") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (group === "type") {
                      setGroup("size");
                      setSize(null);
                      return;
                    }
                    setGroup("category");
                    setCategory(null);
                    setSize(null);
                  }}
                >
                  Back
                </Button>
              )}
              <span className="max-w-full text-xs text-muted-foreground">{crumb}</span>
              <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} title="Refresh stock">
                <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {loading ? (
            <Skeleton className="h-[380px] w-full rounded-xl" />
          ) : error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No stock movement in this period.</p>
          ) : (
            <InventoryMovementWaterfallVisx
              rows={rows}
              onLabelClick={(row) => {
                if (row.key === "__total_start__" || row.key === "__total_end__") return;
                if (group === "category") {
                  setGroup("size");
                  setCategory(row.key);
                  setSize(null);
                  return;
                }
                if (group === "size") {
                  setGroup("type");
                  setSize(row.key);
                }
              }}
              isLabelClickable={(row) => group !== "type" && row.key !== "__total_start__" && row.key !== "__total_end__"}
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 gap-2 py-4">
        <CardHeader className="px-4 sm:px-6">
          <CardTitle className="text-base">Stock value today</CardTitle>
          <CardDescription>
            What the stock on hand is worth at cost and at MSRP is an as-of-now figure, kept with prices in{" "}
            <Link className="underline underline-offset-2" href={costingsHref}>
              Costings
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>

      <ProductConfigurationCard />
    </div>
  );
}

function CustomersTab({ period }: { period: Period }) {
  const [metrics, setMetrics] = useState<MpConfigMetricBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMpConfigMetricsBreakdown({ from: period.from, to: period.to });
      setMetrics(res.metrics ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load Results answers.");
      setMetrics([]);
    } finally {
      setLoading(false);
    }
  }, [period.from, period.to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <Card className="min-w-0 gap-4 py-4 sm:gap-6 sm:py-6">
        <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
          <div className="flex items-center gap-1.5">
            <CardTitle>Results</CardTitle>
            <InfoTip label="About Results">
              How customers answered the questionnaire on Results finalised in the period.
            </InfoTip>
          </div>
          <CardAction>
            <Button variant="ghost" size="icon" onClick={() => void load()} disabled={loading} title="Refresh Results">
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="px-4 sm:px-6">
          {loading ? (
            <Skeleton className="h-[320px] w-full rounded-xl" />
          ) : error ? (
            <p className="text-sm text-muted-foreground">{error}</p>
          ) : metrics.every((m) => (m.total ?? 0) <= 0) ? (
            <p className="text-sm text-muted-foreground">No finalised Results in this period.</p>
          ) : (
            <MpConfigMetricsStackedBarVisx metrics={metrics} />
          )}
        </CardContent>
      </Card>

      <DropOffReasonsCard />
      <UnsubscribeReasonsCard />
    </div>
  );
}

export default function AnalyticsClient({ initialTab = "sales" }: { initialTab?: AnalyticsTab }) {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
  const [tab, setTab] = useState<AnalyticsTab>(initialTab);
  const [range, setRange] = useState<{ from: Date; to: Date }>(() => ({
    from: startOfMonth(subMonths(new Date(), 5)),
    to: endOfMonth(new Date()),
  }));
  const period = useMemo(() => periodOf(range), [range]);

  const selectTab = (next: string) => {
    const value = parseAnalyticsTab(next);
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url);
  };

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1.5">
          <h1>Analytics</h1>
          <InfoTip label="About Analytics">
            Four views, each for one question. The period applies to every tab except Search visibility, which keeps
            its own range. Months are Singapore calendar months.
          </InfoTip>
        </div>
        <PeriodPicker value={range} onChange={setRange} />
      </div>

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList className="w-full sm:w-fit">
          {ANALYTICS_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>
              {ANALYTICS_TAB_LABELS[t]}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="pt-2 text-sm text-muted-foreground">{ANALYTICS_TAB_QUESTIONS[tab]}</p>

        <TabsContent value="sales" className="pt-4">
          <SalesTab from={period.from} to={period.to} dateRange={period.dateRange} />
        </TabsContent>
        <TabsContent value="stock" className="pt-4">
          <StockTab period={period} costingsHref={withLocale("/settings/costings", locale)} />
        </TabsContent>
        <TabsContent value="customers" className="pt-4">
          <CustomersTab period={period} />
        </TabsContent>
        <TabsContent value="traffic" className="grid grid-cols-1 gap-6 pt-4">
          <SearchVisibilityCard />
          <ProspectJourneyCard from={period.from} to={period.to} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
