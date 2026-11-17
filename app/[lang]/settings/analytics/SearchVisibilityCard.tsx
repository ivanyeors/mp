"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { Bucket, Delta, Totals } from "@/lib/seo-metrics/aggregate";
import { CHANNEL_LABELS } from "@/lib/analytics/ai-referrers";
import {
  ANNOTATION_CATEGORIES,
  ANNOTATION_CATEGORY_LABELS,
  type Annotation,
} from "@/lib/seo-metrics/annotations";
import {
  createSeoAnnotation,
  deleteSeoAnnotation,
  getChannelMix,
  getCrawlerActivity,
  getSeoAnnotations,
  getAiAnswers,
  getSearchQueries,
  getSearchVisibility,
  importAiReports,
  addTargetQuery,
  removeTargetQuery,
} from "./seo-actions";
import { InfoTip } from "@/components/ui/info-tip";
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";

const SeoTrendVisx = dynamic(() => import("./SeoTrendVisx").then((m) => m.SeoTrendVisx), { ssr: false });
const ChannelMixVisx = dynamic(() => import("./ChannelMixVisx").then((m) => m.ChannelMixVisx), { ssr: false });

type Visibility = Awaited<ReturnType<typeof getSearchVisibility>>;
type Mix = Awaited<ReturnType<typeof getChannelMix>>;
type Crawlers = Awaited<ReturnType<typeof getCrawlerActivity>>;

const PURPOSE_LABELS = {
  training: "Model training",
  ai_search: "AI search index",
  user_fetch: "Live fetch for a user",
  search_engine: "Search engine",
  unknown: "Unknown",
} as const;

type Queries = Awaited<ReturnType<typeof getSearchQueries>>;
type AiAnswers = Awaited<ReturnType<typeof getAiAnswers>>;
type ImportResult = Extract<Awaited<ReturnType<typeof importAiReports>>, { ok: true }>["results"][number];

function importedNote(lastDate: string | null, importedAt: string | null) {
  if (!lastDate) return "Not imported yet";
  return `Data through ${lastDate}${importedAt ? ` · uploaded ${importedAt.slice(0, 10)}` : ""}`;
}

/** Imported AI-answer reports + upload (slice 07). */
export function AiAnswersPanel({
  ai,
  annotations,
  onImported,
}: {
  ai: AiAnswers | null;
  annotations?: Annotation[];
  onImported: () => void;
}) {
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const upload = (list: FileList | null) => {
    if (!list?.length) return;
    startTransition(async () => {
      const files = await Promise.all([...list].map(async (f) => ({ name: f.name, text: await f.text() })));
      const r = await importAiReports(files);
      if (!r.ok) {
        setError(r.error);
        setResults(null);
        return;
      }
      setError(null);
      setResults(r.results);
      onImported();
    });
  };

  const hasAny = !!ai && (ai.google.lastDate || ai.bing.lastDate);
  return (
    <div className="space-y-4">
      {ai && hasAny ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <figure className="space-y-1">
            <figcaption>
              <div className="text-sm font-medium">Google AI Overviews &amp; AI Mode · impressions</div>
              <div className="text-xs text-muted-foreground">
                {int.format(ai.google.total)} in range · {importedNote(ai.google.lastDate, ai.google.importedAt)}
              </div>
            </figcaption>
            <SeoTrendVisx
              label="AI impressions"
              points={ai.google.points}
              granularity={ai.granularity}
              formatValue={fmtCount}
              height={150}
              annotations={annotations}
            />
          </figure>
          <figure className="space-y-1">
            <figcaption>
              <div className="text-sm font-medium">Bing Copilot · citations</div>
              <div className="text-xs text-muted-foreground">
                {int.format(ai.bing.total)} in range · {importedNote(ai.bing.lastDate, ai.bing.importedAt)}
              </div>
            </figcaption>
            <SeoTrendVisx
              label="Citations"
              points={ai.bing.points}
              granularity={ai.granularity}
              formatValue={fmtCount}
              height={150}
              annotations={annotations}
            />
          </figure>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No AI-answer reports imported yet. Neither Google nor Bing offers these through an API, so upload the exports below.
        </div>
      )}

      {ai?.topPages?.rows.length ? (
        <div className="space-y-1">
          <div className="text-xs font-medium">
            Pages shown in Google AI answers{" "}
            <span className="font-normal text-muted-foreground">
              ({ai.topPages.period || "export period"}, uploaded {ai.topPages.importedOn})
            </span>
          </div>
          <ul className="divide-y rounded-md border text-xs">
            {ai.topPages.rows.map((p) => (
              <li key={p.page} className="flex items-center gap-2 px-2 py-1.5">
                <span className="min-w-0 flex-1 truncate" title={p.page}>
                  {shortPath(p.page)}
                </span>
                {/\/zh-CN(\/|$)/.test(p.page) ? (
                  <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">中文</span>
                ) : null}
                <span className="shrink-0 tabular-nums">{int.format(p.impressions)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2 rounded-md border p-3">
        <label className="block text-xs font-medium" htmlFor="ai-report-upload">
          Upload exports (select several CSVs at once)
        </label>
        <input
          id="ai-report-upload"
          type="file"
          accept=".csv,text/csv"
          multiple
          disabled={pending}
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-xs max-md:file:min-h-11 active:file:bg-press"
        />
        <div className="text-xs text-muted-foreground">
          Google: Search Console → Performance → Generative AI → Export (all files, including Filters.csv). Bing: Webmaster
          Tools → AI Performance → Export. Re-uploading overlapping dates replaces them.
        </div>
        {pending ? <div className="text-xs text-muted-foreground">Importing…</div> : null}
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
        {results ? (
          <ul className="space-y-1 text-xs">
            {results.map((r) => (
              <li key={r.name}>
                <span className="font-medium">{r.name}</span>:{" "}
                {r.ok ? (
                  <span>
                    {r.label}, {int.format(r.rows ?? 0)} rows
                    {r.skipped ? `, ${r.skipped} skipped` : ""}
                    {r.warning ? (
                      <span className="mt-0.5 flex items-center gap-1 text-muted-foreground">
                        <AlertTriangle className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                        {r.warning}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-destructive">{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
type MoverRow = Queries["queryMovers"]["gainers"][number];

/** Show a URL as its path, so the column stays readable. */
function shortPath(url: string): string {
  try {
    const u = new URL(url);
    return decodeURIComponent(u.pathname.replace(/^\/(en-US|zh-CN)(?=\/|$)/, "")) || "/";
  } catch {
    return url;
  }
}

function PositionChange({ position, previous }: { position: number | null; previous: number | null }) {
  if (position === null) return <span className="text-muted-foreground">not ranking</span>;
  const change = previous === null ? null : position - previous;
  const Icon = change === null || Math.abs(change) < 0.05 ? null : change < 0 ? ArrowUpRight : ArrowDownRight;
  // Lower position = better, so a negative change is good.
  const tone = change !== null && change < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-medium">{fmtPos(position)}</span>
      {Icon && change !== null ? (
        <span className="inline-flex items-center text-muted-foreground">
          <Icon className={`size-3 ${tone}`} aria-hidden />
          {Math.abs(change).toFixed(1)}
          <span className="sr-only">{change < 0 ? " better" : " worse"}</span>
        </span>
      ) : null}
    </span>
  );
}

function MoversList({ title, rows, isPage }: { title: string; rows: MoverRow[]; isPage: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-xs font-medium">{title}</div>
      {rows.length ? (
        <ul className="divide-y rounded-md border text-xs">
          {rows.map((m) => (
            <li key={m.key} className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1 truncate" title={m.key}>
                {isPage ? shortPath(m.key) : m.key}
              </span>
              <span className="shrink-0 tabular-nums">
                {m.deltaClicks > 0 ? "+" : ""}
                {int.format(m.deltaClicks)}
              </span>
              <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                {int.format(m.previousClicks)} → {int.format(m.clicks)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-muted-foreground">None this period.</div>
      )}
    </div>
  );
}

/** Target-query watchlist + biggest movers (slice 06). */
export function QueriesPanel({ queries, onChange }: { queries: Queries; onChange: () => void }) {
  const [moversOf, setMoversOf] = useState<"queries" | "pages">("queries");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const movers = moversOf === "queries" ? queries.queryMovers : queries.pageMovers;

  const add = () =>
    startTransition(async () => {
      const r = await addTargetQuery(draft);
      if (!r.ok) return setError(r.error);
      setError(null);
      setDraft("");
      onChange();
    });
  const remove = (q: string) =>
    startTransition(async () => {
      const r = await removeTargetQuery(q);
      if (!r.ok) return setError(r.error);
      setError(null);
      onChange();
    });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="text-sm font-medium">Target searches</div>
        {/* Phone: one row per search, so position, clicks and the ranking page stay on screen. */}
        <MobileList className="rounded-md text-xs tabular-nums">
          {queries.watchlist.map((w) => (
            <MobileListRow
              key={w.query}
              actions={
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={pending}
                  onClick={() => remove(w.query)}
                  aria-label={`Stop tracking ${w.query}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 break-words text-sm font-medium">{w.query}</span>
                <Sparkline values={w.spark} invert />
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-muted-foreground">
                <span className="inline-flex items-center gap-1 text-foreground">
                  <span className="text-muted-foreground">Position</span>
                  <PositionChange position={w.position} previous={w.previousPosition} />
                </span>
                <span>{int.format(w.clicks)} clicks</span>
                <span>{int.format(w.impressions)} impressions</span>
              </div>
              {w.topPage ? (
                <div className="mt-0.5 flex min-w-0 items-center gap-1 text-muted-foreground">
                  <span className="truncate" title={w.topPage}>
                    {shortPath(w.topPage)}
                  </span>
                  {w.competingPages.length ? (
                    <span className="inline-flex shrink-0 items-center gap-0.5">
                      <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400" aria-hidden />+
                      {w.competingPages.length} competing
                    </span>
                  ) : null}
                </div>
              ) : null}
            </MobileListRow>
          ))}
        </MobileList>
        <div className="hidden overflow-x-auto rounded-md border md:block">
          <table className="w-full min-w-[640px] text-xs tabular-nums">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-2 py-1.5 font-medium">Search</th>
                <th className="px-2 py-1.5 font-medium">Position</th>
                <th className="px-2 py-1.5 font-medium">12 weeks</th>
                <th className="px-2 py-1.5 text-right font-medium">Clicks</th>
                <th className="px-2 py-1.5 text-right font-medium">Impressions</th>
                <th className="px-2 py-1.5 font-medium">Ranking page</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {queries.watchlist.map((w) => (
                <tr key={w.query} className="border-t">
                  <td className="px-2 py-1.5">{w.query}</td>
                  <td className="px-2 py-1.5">
                    <PositionChange position={w.position} previous={w.previousPosition} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Sparkline values={w.spark} invert />
                  </td>
                  <td className="px-2 py-1.5 text-right">{int.format(w.clicks)}</td>
                  <td className="px-2 py-1.5 text-right">{int.format(w.impressions)}</td>
                  <td className="max-w-[16rem] px-2 py-1.5">
                    {w.topPage ? (
                      <span className="flex items-center gap-1">
                        <span className="truncate" title={w.topPage}>
                          {shortPath(w.topPage)}
                        </span>
                        {w.competingPages.length ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
                            title={`Also ranking: ${w.competingPages.map(shortPath).join(", ")}`}
                          >
                            <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400" aria-hidden />+{w.competingPages.length}{" "}
                            competing
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-1 py-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={pending}
                      onClick={() => remove(w.query)}
                      aria-label={`Stop tracking ${w.query}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input value={draft} maxLength={120} placeholder="Track another search, e.g. orthopedic pillow singapore" onChange={(e) => setDraft(e.target.value)} aria-label="Search to track" />
          <Button type="submit" disabled={pending || draft.trim().length < 2}>
            Track
          </Button>
        </form>
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
        <div className="text-xs text-muted-foreground">
          Exact-match Search Console queries. &ldquo;Competing&rdquo; means another of our pages takes at least 20% of that
          search&apos;s impressions: candidates for merging.
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-medium">Biggest movers vs previous period</div>
          <Tabs value={moversOf} onValueChange={(v) => setMoversOf(v === "pages" ? "pages" : "queries")}>
            <TabsList>
              <TabsTrigger value="queries">Searches</TabsTrigger>
              <TabsTrigger value="pages">Pages</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <MoversList title="Gaining clicks" rows={movers.gainers} isPage={moversOf === "pages"} />
          <MoversList title="Losing clicks" rows={movers.losers} isPage={moversOf === "pages"} />
        </div>
        <div className="text-xs text-muted-foreground">Ignores rows with under 30 impressions across both periods.</div>
      </div>
    </div>
  );
}

/** Annotations in range + add form (slice 05). */
export function AnnotationsPanel({ annotations, onChange }: { annotations: Annotation[]; onChange: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<string>("seo");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const r = await createSeoAnnotation({ date, label, category, url });
      if (!r.ok) return setError(r.error);
      setError(null);
      setLabel("");
      setUrl("");
      onChange();
    });
  const remove = (id: string) =>
    startTransition(async () => {
      const r = await deleteSeoAnnotation(id);
      if (!r.ok) return setError(r.error);
      setError(null);
      onChange();
    });

  return (
    <div className="space-y-3">
      {annotations.length ? (
        <ul className="divide-y rounded-md border text-xs">
          {[...annotations].reverse().map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-2 py-1.5">
              <span className="w-[4.75rem] shrink-0 tabular-nums text-muted-foreground">{a.date}</span>
              <span className="hidden w-28 shrink-0 text-muted-foreground sm:inline">{ANNOTATION_CATEGORY_LABELS[a.category]}</span>
              <span className="min-w-0 flex-1 truncate">
                {a.url ? (
                  <a href={a.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {a.label}
                  </a>
                ) : (
                  a.label
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                disabled={pending}
                onClick={() => remove(a.id)}
                aria-label={`Delete annotation: ${a.label}`}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-xs text-muted-foreground">No annotations in this range.</div>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[9rem_9rem_1fr_1fr_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm active:bg-press max-md:h-11"
        >
          {ANNOTATION_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ANNOTATION_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <Input value={label} maxLength={120} placeholder="What happened, e.g. Honeycombers listicle live" onChange={(e) => setLabel(e.target.value)} aria-label="Label" />
        <Input type="url" value={url} placeholder="Link (optional)" onChange={(e) => setUrl(e.target.value)} aria-label="Link" />
        <Button type="submit" disabled={pending || !label.trim()}>
          Add
        </Button>
      </form>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}
    </div>
  );
}

/** Presentational: AI crawler activity (slice 04). */
export function CrawlerPanel({ crawlers, annotations }: { crawlers: Crawlers; annotations?: Annotation[] }) {
  if (!crawlers.hasData) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground max-md:p-4">
        No crawler hits recorded yet. Counting starts once the <code className="rounded bg-muted px-1">ai_crawler_hits</code>{" "}
        migration is applied and the next deploy is live; AI crawlers usually show up within days.
      </div>
    );
  }
  const change =
    crawlers.previousAiHits > 0 ? (crawlers.aiHits - crawlers.previousAiHits) / crawlers.previousAiHits : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">AI crawler hits</div>
          <div className="text-xl font-semibold tabular-nums">{int.format(crawlers.aiHits)}</div>
          <div className="text-xs text-muted-foreground">
            {change === null ? "No previous data" : `${change >= 0 ? "+" : ""}${(change * 100).toFixed(0)}% vs prev. period`}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">/llms.txt fetches</div>
          <div className="text-xl font-semibold tabular-nums">{int.format(crawlers.llmsTxtHits)}</div>
          <div className="text-xs text-muted-foreground">Bots reading our AI guide</div>
        </div>
      </div>
      <SeoTrendVisx
        label="AI crawler hits"
        points={crawlers.buckets}
        granularity={crawlers.granularity}
        formatValue={fmtCount}
        height={150}
        annotations={annotations}
      />
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[560px] text-xs tabular-nums">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-2 py-1.5 font-medium">Crawler</th>
              <th className="px-2 py-1.5 font-medium">Purpose</th>
              <th className="px-2 py-1.5 text-right font-medium">Hits</th>
              <th className="px-2 py-1.5 text-right font-medium">Prev. period</th>
              <th className="px-2 py-1.5 font-medium">Most fetched</th>
            </tr>
          </thead>
          <tbody>
            {crawlers.bots.map((b) => (
              <tr key={b.bot} className={`border-t ${b.purpose === "search_engine" ? "text-muted-foreground" : ""}`}>
                <td className="px-2 py-1.5">
                  {b.bot} <span className="text-muted-foreground">· {b.operator}</span>
                </td>
                <td className="px-2 py-1.5">{PURPOSE_LABELS[b.purpose]}</td>
                <td className="px-2 py-1.5 text-right">{int.format(b.hits)}</td>
                <td className="px-2 py-1.5 text-right">{int.format(b.previousHits)}</td>
                <td className="px-2 py-1.5">{b.topPaths.map((p) => `${p.pathGroup} (${int.format(p.hits)})`).join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-muted-foreground">
        Identified by user agent, not verified against each operator&apos;s IP ranges. Search-index and live-fetch bots
        (OAI-SearchBot, PerplexityBot, ChatGPT-User, Claude-User) are the ones that lead to citations. Search engines are
        listed for comparison and left out of the chart.
      </div>
    </div>
  );
}

const sgd = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });
const rate = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : "—");

type Credit = "last" | "first";
type FunnelLine = {
  key: string;
  label: string;
  /** How a platform's Visits came (Paid, Social, …); absent on a channel row. */
  via?: string;
  visits: number;
  configuratorVisits: number;
  orders: number;
  revenue: number;
};

/** Phone list and desktop table of one funnel, by channel or by platform. */
function FunnelTable({ heading, rows, totalVisits }: { heading: string; rows: FunnelLine[]; totalVisits: number }) {
  return (
    <>
      {/* Phone: one row each; the seven-column table hid its funnel columns off-screen. */}
      <MobileList className="rounded-md text-xs tabular-nums">
        {rows.map((r) => (
          <MobileListRow key={r.key}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                {r.label}
                {r.via ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">{r.via}</span> : null}
              </span>
              <span className="shrink-0">
                {int.format(r.visits)} visits <span className="text-muted-foreground">({rate(r.visits, totalVisits)})</span>
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-muted-foreground">
              <span>
                Configurator {int.format(r.configuratorVisits)} ({rate(r.configuratorVisits, r.visits)})
              </span>
              <span>
                Orders {int.format(r.orders)} ({rate(r.orders, r.visits)})
              </span>
              <span>Revenue {r.revenue ? sgd.format(r.revenue) : "—"}</span>
            </div>
          </MobileListRow>
        ))}
      </MobileList>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full min-w-[560px] text-xs tabular-nums">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-2 py-1.5 font-medium">{heading}</th>
              <th className="px-2 py-1.5 text-right font-medium">Visits</th>
              <th className="px-2 py-1.5 text-right font-medium">Share</th>
              <th className="px-2 py-1.5 text-right font-medium" title="Visits that opened mp-config or mbolster-config">
                Configurator
              </th>
              <th className="px-2 py-1.5 text-right font-medium">Orders</th>
              <th className="px-2 py-1.5 text-right font-medium">Visit → order</th>
              <th className="px-2 py-1.5 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t">
                <td className="px-2 py-1.5">
                  {r.label}
                  {r.via ? <span className="ml-1.5 text-muted-foreground">{r.via}</span> : null}
                </td>
                <td className="px-2 py-1.5 text-right">{int.format(r.visits)}</td>
                <td className="px-2 py-1.5 text-right">{rate(r.visits, totalVisits)}</td>
                <td className="px-2 py-1.5 text-right">
                  {int.format(r.configuratorVisits)}{" "}
                  <span className="text-muted-foreground">({rate(r.configuratorVisits, r.visits)})</span>
                </td>
                <td className="px-2 py-1.5 text-right">{int.format(r.orders)}</td>
                <td className="px-2 py-1.5 text-right">{rate(r.orders, r.visits)}</td>
                <td className="px-2 py-1.5 text-right">{r.revenue ? sgd.format(r.revenue) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Presentational: visits by channel, the funnel per channel, and the same per platform. */
export function ChannelMixPanel({ mix, annotations }: { mix: Mix; annotations?: Annotation[] }) {
  const [credit, setCredit] = useState<Credit>("last");
  const counted = <T extends { orders: number; revenue: number; firstOrders: number; firstRevenue: number }>(r: T) =>
    credit === "first" ? { orders: r.firstOrders, revenue: r.firstRevenue } : { orders: r.orders, revenue: r.revenue };
  const channels: FunnelLine[] = mix.funnel.map((r) => ({
    key: r.channel,
    label: CHANNEL_LABELS[r.channel],
    visits: r.visits,
    configuratorVisits: r.configuratorVisits,
    ...counted(r),
  }));
  const platforms: FunnelLine[] = mix.platforms.map((r) => ({
    key: `${r.platform}:${r.channel}`,
    label: r.platform,
    via: CHANNEL_LABELS[r.channel],
    visits: r.visits,
    configuratorVisits: r.configuratorVisits,
    ...counted(r),
  }));

  return (
    <div className="space-y-4">
      <ChannelMixVisx buckets={mix.buckets} granularity={mix.granularity} annotations={annotations} />
      {mix.aiSources.length ? (
        <div className="text-xs text-muted-foreground">
          AI assistants:{" "}
          {mix.aiSources.map((a, i) => (
            <span key={a.source}>
              {i ? " · " : null}
              <span className="text-foreground">{a.source}</span> {int.format(a.visits)} visits
              {a.orders ? `, ${int.format(a.orders)} orders` : null}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {credit === "first"
            ? "Orders are counted for where the shopper first came from."
            : "Orders are counted for the visit that paid."}
        </div>
        <Tabs value={credit} onValueChange={(v) => setCredit(v === "first" ? "first" : "last")}>
          <TabsList>
            <TabsTrigger value="last">Visit that paid</TabsTrigger>
            <TabsTrigger value="first">First visit</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <FunnelTable heading="Channel" rows={channels} totalVisits={mix.totalVisits} />
      <div className="space-y-2">
        <div>
          <h4 className="text-sm font-medium">By platform</h4>
          <div className="text-xs text-muted-foreground">
            Google, Instagram, TikTok and the rest, split by how the visit came: an ad, a search, or a post or profile link.
          </div>
        </div>
        {platforms.length ? (
          <FunnelTable heading="Platform" rows={platforms} totalVisits={mix.totalVisits} />
        ) : (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            No visit in this period named a platform.
          </p>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        From first-party visit tracking (since Jul 2026). AI apps often send no referrer, so those visits count as Direct:
        read the AI assistant figure as a minimum. An Instagram or Facebook ad counts as Paid only when its link is tagged
        with a paid medium; Google and TikTok ads are recognised on their own. A first visit is the earliest we can tie to
        the shopper, which is the same browser, or another one where they gave the same email.
      </div>
    </div>
  );
}

// `short` is shown while the card header is under 42rem: five full labels plus
// Weekly/Daily need ~580px, and without room the strip collapses to a menu.
const RANGES = [
  { value: "28d", label: "28 days", short: "28D" },
  { value: "3m", label: "3 months", short: "3M" },
  { value: "6m", label: "6 months", short: "6M" },
  { value: "12m", label: "12 months", short: "12M" },
  { value: "16m", label: "16 months", short: "16M" },
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
    // Wraps as whole pieces: in a half-width phone tile "vs prev. period" drops to its own line.
    <span className="inline-flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
      <Icon className={`size-3.5 ${tone}`} aria-hidden />
      <span className="whitespace-nowrap tabular-nums text-foreground">{metric.formatDelta(delta.value)}</span>
      <span className="whitespace-nowrap">
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
export function VisibilityPanel({
  data,
  loading,
  annotations,
}: {
  data: Visibility;
  loading: boolean;
  annotations?: Annotation[];
}) {
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
          <SeoTrendVisx label="Clicks" points={points(data.buckets, "clicks")} granularity={data.granularity} formatValue={fmtCount} annotations={annotations} />
        </figure>
        <figure className="space-y-1">
          <figcaption className="text-sm font-medium">Impressions</figcaption>
          <SeoTrendVisx label="Impressions" points={points(data.buckets, "impressions")} granularity={data.granularity} formatValue={fmtCount} annotations={annotations} />
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
          height={160} annotations={annotations}
        />
      </figure>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground active:opacity-60 max-md:py-3">
          View as table
        </summary>
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
  const [mix, setMix] = useState<Mix | null>(null);
  const [mixError, setMixError] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationsVersion, setAnnotationsVersion] = useState(0);
  const refreshAnnotations = useCallback(() => setAnnotationsVersion((v) => v + 1), []);
  const [queries, setQueries] = useState<Queries | null>(null);
  const [queriesVersion, setQueriesVersion] = useState(0);
  const refreshQueries = useCallback(() => setQueriesVersion((v) => v + 1), []);
  const [ai, setAi] = useState<AiAnswers | null>(null);
  const [aiVersion, setAiVersion] = useState(0);
  const refreshAi = useCallback(() => setAiVersion((v) => v + 1), []);
  const [crawlers, setCrawlers] = useState<Crawlers | null>(null);
  const [crawlersError, setCrawlersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Loading is derived: the request key we last settled differs from the one on screen.
  const requestKey = `${range}|${granularity}`;
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const loading = settledKey !== requestKey;

  useEffect(() => {
    let cancelled = false;
    getSeoAnnotations({ range, granularity })
      .then((a) => {
        if (!cancelled) setAnnotations(a);
      })
      // Markers are context, not data: a failure leaves the charts unannotated, not broken.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [range, granularity, annotationsVersion]);

  useEffect(() => {
    let cancelled = false;
    getSearchQueries({ range })
      .then((q) => {
        if (!cancelled) setQueries(q);
      })
      .catch(() => {
        if (!cancelled) setQueries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [range, queriesVersion]);

  useEffect(() => {
    let cancelled = false;
    getAiAnswers({ range, granularity })
      .then((a) => {
        if (!cancelled) setAi(a);
      })
      // Before the migration is applied the panel still offers the upload.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [range, granularity, aiVersion]);

  useEffect(() => {
    let cancelled = false;
    getCrawlerActivity({ range, granularity })
      .then((c) => {
        if (cancelled) return;
        setCrawlers(c);
        setCrawlersError(null);
      })
      .catch((e) => {
        if (!cancelled) setCrawlersError(e instanceof Error ? e.message : "Failed to load");
      });
    getChannelMix({ range, granularity })
      .then((m) => {
        if (cancelled) return;
        setMix(m);
        setMixError(null);
      })
      .catch((e) => {
        if (!cancelled) setMixError(e instanceof Error ? e.message : "Failed to load");
      });
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
        <div className="flex items-center gap-1.5">
          <CardTitle>Search &amp; AI visibility</CardTitle>
          <InfoTip label="About Search & AI visibility">
            Google web search from Search Console (synced daily; the last 3 days are partial while Google revises them), and
            first-party visits by channel.
          </InfoTip>
        </div>
        {data?.lastDate ? <CardDescription>Latest data: {data.lastDate}.</CardDescription> : null}
        {/* Not a CardAction: seven tabs beside the description squeeze it to a sliver below
            ~1280px, so they get their own row. On a phone each strip is a full-width row of its
            own, like the other analytics cards' tabs. */}
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <Tabs value={range} onValueChange={setRange} className="w-full sm:min-w-0 sm:flex-1">
            <TabsList className="w-full sm:w-fit">
              {RANGES.map((r) => (
                <TabsTrigger key={r.value} value={r.value} aria-label={r.label}>
                  <span className="@2xl/card-header:hidden">{r.short}</span>
                  <span className="hidden @2xl/card-header:inline">{r.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Tabs value={granularity} onValueChange={(v) => setGranularity(v === "day" ? "day" : "week")} className="w-full sm:w-auto">
            <TabsList className="w-full sm:w-fit">
              <TabsTrigger value="week">Weekly</TabsTrigger>
              <TabsTrigger value="day">Daily</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
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
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground max-md:p-4">
            No Search Console data yet. Once the service account and env vars are set, run{" "}
            <code className="rounded bg-muted px-1">npm run seo:gsc-backfill</code> to load 16 months; the daily cron keeps
            it current after that. Setup steps: <code className="rounded bg-muted px-1">.claude/PRD-search-visibility/GOOGLE-ACCESS-SETUP.md</code>.
          </div>
        ) : (
          <div className="space-y-6">
            <VisibilityPanel data={data} loading={loading} annotations={annotations} />
            {queries?.hasData ? <QueriesPanel queries={queries} onChange={refreshQueries} /> : null}
          </div>
        )}

        <section className="space-y-3 border-t pt-6 max-md:pt-4">
          <div>
            <h3 className="text-sm font-medium">Visits by channel</h3>
            <div className="text-xs text-muted-foreground">Where visits came from, with AI assistants as their own channel.</div>
          </div>
          {mixError ? (
            <p className="text-sm text-destructive">{mixError}</p>
          ) : mix ? (
            <ChannelMixPanel mix={mix} annotations={annotations} />
          ) : (
            <Skeleton className="h-[260px]" />
          )}
        </section>

        <section className="space-y-3 border-t pt-6 max-md:pt-4">
          <div>
            <h3 className="text-sm font-medium">AI answers</h3>
            <div className="text-xs text-muted-foreground">
              How often Google&apos;s AI features and Bing Copilot showed or cited our pages, from report exports.
            </div>
          </div>
          <AiAnswersPanel ai={ai} annotations={annotations} onImported={refreshAi} />
        </section>

        <section className="space-y-3 border-t pt-6 max-md:pt-4">
          <div>
            <h3 className="text-sm font-medium">AI crawlers</h3>
            <div className="text-xs text-muted-foreground">
              Bots from AI companies fetching our pages: the earliest sign of being picked up by AI answers.
            </div>
          </div>
          {crawlersError ? (
            <div className="text-sm text-destructive">{crawlersError}</div>
          ) : crawlers ? (
            <CrawlerPanel crawlers={crawlers} annotations={annotations} />
          ) : (
            <Skeleton className="h-[220px]" />
          )}
        </section>

        <section className="space-y-3 border-t pt-6 max-md:pt-4">
          <div>
            <h3 className="text-sm font-medium">Annotations</h3>
            <div className="text-xs text-muted-foreground">
              Log what shipped or happened (a content merge, a listicle, a site change). It shows as a marker on every chart
              above, so a change in a trend can be traced to its cause.
            </div>
          </div>
          <AnnotationsPanel annotations={annotations} onChange={refreshAnnotations} />
        </section>
      </CardContent>
    </Card>
  );
}
