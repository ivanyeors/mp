"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bucket, Delta, Totals } from "@/lib/seo-metrics/aggregate";
import { getSearchVisibility } from "./seo-actions";

const SeoTrendVisx = dynamic(() => import("./SeoTrendVisx").then((m) => m.SeoTrendVisx), { ssr: false });

type Visibility = Awaited<ReturnType<typeof getSearchVisibility>>;

const RANGES = [
  { value: "28d", label: "28 days" },
  { value: "3m", label: "3 months" },
  { value: "6m", label: "6 months" },
  { value: "12m", label: "12 months" },
  { value: "16m", label: "16 months" },
] as const;

const int = new Intl.NumberFormat("en-SG");
const compact = new Intl.NumberFormat("en-SG", { notation: "compact", maximumFractionDigits: 1 });
const fmtCount = (v: number) => (Math.abs(v) >= 10_000 ? compact.format(v) : int.format(Math.round(v)));
const fmtPct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 2 : 1)}%`;
const fmtPos = (v: number) => v.toFixed(1);

type Metric = {
  key: keyof Totals;
  label: string;
  format: (v: number) => string;
  formatDelta: (v: number) => string;
  invert?: boolean;
  hint: string;
};

const METRICS: Metric[] = [
  {
    key: "clicks",
    label: "Clicks",
    format: fmtCount,
    formatDelta: (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`,
    hint: "Visits from Google web search",
  },
  {
    key: "impressions",
    label: "Impressions",
    format: fmtCount,
    formatDelta: (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`,
    hint: "Times a result of ours was shown",
  },
  {
    key: "ctr",
    label: "CTR",
    format: fmtPct,
    formatDelta: (v) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)} pp`,
    hint: "Clicks ÷ impressions",
  },
  {
    key: "position",
    label: "Avg position",
    format: fmtPos,
    formatDelta: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`,
    invert: true,
    hint: "Impression-weighted; lower is better",
  },
];

function DeltaBadge({ delta, metric }: { delta: Delta; metric: Metric }) {
  if (delta.value === null || delta.direction === null) {
    return <span className="text-xs text-muted-foreground">No previous data</span>;
  }
  const Icon = delta.direction === "flat" ? Minus : (delta.value > 0) ? ArrowUpRight : ArrowDownRight;
  // Status color on the icon only; the text stays in ink so it never relies on color.
  const tone =
    delta.direction === "better" ? "text-emerald-600 dark:text-emerald-400" : delta.direction === "worse" ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className={`size-3.5 ${tone}`} aria-hidden />
      <span className="tabular-nums text-foreground">{metric.formatDelta(delta.value)}</span>
      <span>
        vs prev. period
        <span className="sr-only"> ({delta.direction})</span>
      </span>
    </span>
  );
}

function Sparkline({ values, invert }: { values: (number | null)[]; invert?: boolean }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return null;
  const w = 96;
  const h = 24;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const d = pts
    .map((p, k) => {
      const x = (p.i / Math.max(1, values.length - 1)) * w;
      const norm = (p.v - min) / span;
      const y = 2 + (invert ? norm : 1 - norm) * (h - 4);
      return `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden className="h-6 w-14 shrink-0 overflow-visible sm:w-24">
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function points(buckets: Bucket[], key: keyof Totals) {
  return buckets.map((b) => ({ start: b.start, value: b[key], partial: b.partial }));
}

/** Presentational: everything below the header once data is loaded. */
export function VisibilityPanel({ data, loading }: { data: Visibility; loading: boolean }) {
  return (
    <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {METRICS.map((m) => {
          const value = data.totals[m.key];
          return (
            <div key={m.key} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-muted-foreground" title={m.hint}>
                  {m.label}
                </div>
                <Sparkline values={data.buckets.filter((b) => !b.partial).map((b) => b[m.key])} invert={m.invert} />
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{value === null ? "—" : m.format(value)}</div>
              <DeltaBadge delta={data.deltas[m.key]} metric={m} />
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <figure className="space-y-1">
          <figcaption className="text-sm font-medium">Clicks</figcaption>
          <SeoTrendVisx label="Clicks" points={points(data.buckets, "clicks")} granularity={data.granularity} formatValue={fmtCount} />
        </figure>
        <figure className="space-y-1">
          <figcaption className="text-sm font-medium">Impressions</figcaption>
          <SeoTrendVisx label="Impressions" points={points(data.buckets, "impressions")} granularity={data.granularity} formatValue={fmtCount} />
        </figure>
      </div>
      <figure className="space-y-1">
        <figcaption className="text-sm font-medium">
          Average position <span className="font-normal text-muted-foreground">(higher on the chart = better ranking)</span>
        </figcaption>
        <SeoTrendVisx
          label="Avg position"
          points={points(data.buckets, "position")}
          granularity={data.granularity}
          formatValue={fmtPos}
          invert
          height={160}
        />
      </figure>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">View as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-xs tabular-nums">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-2 py-1 font-medium">{data.granularity === "week" ? "Week of" : "Date"}</th>
                <th className="px-2 py-1 text-right font-medium">Clicks</th>
                <th className="px-2 py-1 text-right font-medium">Impressions</th>
                <th className="px-2 py-1 text-right font-medium">CTR</th>
                <th className="px-2 py-1 text-right font-medium">Avg position</th>
              </tr>
            </thead>
            <tbody>
              {[...data.buckets].reverse().map((b) => (
                <tr key={b.start} className="border-t">
                  <td className="px-2 py-1">
                    {b.start}
                    {b.partial ? <span className="ml-1 text-muted-foreground">(partial)</span> : null}
                  </td>
                  <td className="px-2 py-1 text-right">{int.format(b.clicks)}</td>
                  <td className="px-2 py-1 text-right">{int.format(b.impressions)}</td>
                  <td className="px-2 py-1 text-right">{b.ctr === null ? "—" : fmtPct(b.ctr)}</td>
                  <td className="px-2 py-1 text-right">{b.position === null ? "—" : fmtPos(b.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function SearchVisibilityCard() {
  const [range, setRange] = useState<string>("3m");
  const [granularity, setGranularity] = useState<"day" | "week">("week");
  const [data, setData] = useState<Visibility | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Loading is derived: the request key we last settled differs from the one on screen.
  const requestKey = `${range}|${granularity}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const loading = settledKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    getSearchVisibility({ range, granularity })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setSettledKey(`${range}|${granularity}`);
      });
    return () => {
      cancelled = true;
    };
  }, [range, granularity]);

  return (
    <Card className="gap-4 py-4 sm:gap-6 sm:py-6">
      <CardHeader className="gap-3 px-4 sm:gap-2 sm:px-6">
        <CardTitle>Search visibility</CardTitle>
        <CardDescription>
          Google web search (Search Console), synced daily. The last 3 days are partial: Google keeps revising them.
          {data?.lastDate ? ` Latest data: ${data.lastDate}.` : null}
        </CardDescription>
        <CardAction className="col-start-1 row-start-3 flex w-full flex-wrap gap-2 sm:col-start-2 sm:row-start-1 sm:row-span-2 sm:w-auto sm:justify-end">
          <Tabs value={range} onValueChange={setRange}>
            <TabsList>
              {RANGES.map((r) => (
                <TabsTrigger key={r.value} value={r.value}>
                  {r.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v === "day" ? "day" : "week")}>
            <TabsList>
              <TabsTrigger value="week">Weekly</TabsTrigger>
              <TabsTrigger value="day">Daily</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6 px-4 sm:px-6">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : loading && !data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {METRICS.map((m) => (
                <Skeleton key={m.key} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-[180px]" />
          </div>
        ) : !data?.hasData ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No Search Console data yet. Once the service account and env vars are set, run{" "}
            <code className="rounded bg-muted px-1">npm run seo:gsc-backfill</code> to load 16 months; the daily cron keeps
            it current after that. Setup steps: <code className="rounded bg-muted px-1">.claude/PRD-search-visibility/GOOGLE-ACCESS-SETUP.md</code>.
          </div>
        ) : (
          <VisibilityPanel data={data} loading={loading} />
        )}
      </CardContent>
    </Card>
  );
}
