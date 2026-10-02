import { crawlerByName, type CrawlerPurpose } from "@/lib/analytics/ai-crawlers";
import { bucketStart, type Granularity } from "@/lib/seo-metrics/aggregate";
import { addDays } from "@/lib/seo-metrics/dates";

/** Rollups over `ai_crawler_hits` for the visibility section (slice 04). Pure. */

export type CrawlerHitRow = { date: string; bot: string; path_group: string; hits: number };

export type CrawlerBotRow = {
  bot: string;
  operator: string;
  purpose: CrawlerPurpose | "unknown";
  hits: number;
  previousHits: number;
  topPaths: { pathGroup: string; hits: number }[];
};

export type CrawlerActivity = {
  /** AI crawlers only (search engines excluded), per bucket. */
  buckets: { start: string; value: number; partial: boolean }[];
  aiHits: number;
  previousAiHits: number;
  llmsTxtHits: number;
  bots: CrawlerBotRow[];
};

const isAi = (bot: string) => crawlerByName(bot)?.purpose !== "search_engine";

export function buildCrawlerActivity(input: {
  rows: CrawlerHitRow[];
  from: string;
  to: string;
  previousFrom: string;
  granularity: Granularity;
}): CrawlerActivity {
  const first = bucketStart(input.from, input.granularity);
  const step = input.granularity === "day" ? 1 : 7;
  const buckets = new Map<string, number>();
  for (let start = first; start <= input.to; start = addDays(start, step)) buckets.set(start, 0);

  const bots = new Map<string, CrawlerBotRow & { paths: Map<string, number> }>();
  let aiHits = 0;
  let previousAiHits = 0;
  let llmsTxtHits = 0;

  for (const r of input.rows) {
    const ai = isAi(r.bot);
    if (ai && r.date >= first && r.date <= input.to) {
      const key = bucketStart(r.date, input.granularity);
      buckets.set(key, (buckets.get(key) ?? 0) + r.hits);
    }
    const current = r.date >= input.from && r.date <= input.to;
    const previous = r.date >= input.previousFrom && r.date < input.from;
    if (!current && !previous) continue;

    const known = crawlerByName(r.bot);
    const row =
      bots.get(r.bot) ??
      { bot: r.bot, operator: known?.operator ?? "Unknown", purpose: known?.purpose ?? "unknown", hits: 0, previousHits: 0, topPaths: [], paths: new Map() };
    bots.set(r.bot, row);

    if (current) {
      row.hits += r.hits;
      row.paths.set(r.path_group, (row.paths.get(r.path_group) ?? 0) + r.hits);
      if (ai) aiHits += r.hits;
      if (r.path_group === "llms.txt") llmsTxtHits += r.hits;
    } else {
      row.previousHits += r.hits;
      if (ai) previousAiHits += r.hits;
    }
  }

  return {
    // The last bucket holds today, so it is still filling.
    buckets: [...buckets].map(([start, value], i, all) => ({ start, value, partial: i === all.length - 1 })),
    aiHits,
    previousAiHits,
    llmsTxtHits,
    bots: [...bots.values()]
      .map(({ paths, ...row }) => ({
        ...row,
        topPaths: [...paths].map(([pathGroup, hits]) => ({ pathGroup, hits })).sort((a, b) => b.hits - a.hits).slice(0, 3),
      }))
      .sort((a, b) => b.hits - a.hits || b.previousHits - a.previousHits),
  };
}
