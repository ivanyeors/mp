import { bucketStart, bucketize, summarize, type DailyTotal } from "@/lib/seo-metrics/aggregate";
import { addDays } from "@/lib/seo-metrics/dates";
import { splitQueryPageKey } from "@/lib/seo-metrics/keys";

export type KeyTotals = { key: string; clicks: number; impressions: number; position_sum: number };
export type KeyDaily = KeyTotals & { date: string };

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

const position = (t: Pick<KeyTotals, "impressions" | "position_sum"> | undefined) =>
  t && t.impressions > 0 ? t.position_sum / t.impressions : null;

export type Mover = {
  key: string;
  clicks: number;
  previousClicks: number;
  deltaClicks: number;
  impressions: number;
  position: number | null;
  previousPosition: number | null;
};

export function buildMovers(
  current: KeyTotals[],
  previous: KeyTotals[],
  opts: { minImpressions?: number; limit?: number } = {},
): { gainers: Mover[]; losers: Mover[] } {
  const minImpressions = opts.minImpressions ?? 30;
  const limit = opts.limit ?? 10;
  const prev = new Map(previous.map((p) => [p.key, p]));
  const cur = new Map(current.map((c) => [c.key, c]));
  const keys = new Set([...cur.keys(), ...prev.keys()]);

  const movers: Mover[] = [];
  for (const key of keys) {
    const c = cur.get(key);
    const p = prev.get(key);
    if ((c?.impressions ?? 0) + (p?.impressions ?? 0) < minImpressions) continue;
    const clicks = c?.clicks ?? 0;
    const previousClicks = p?.clicks ?? 0;
    if (clicks === previousClicks) continue;
    movers.push({
      key,
      clicks,
      previousClicks,
      deltaClicks: clicks - previousClicks,
      impressions: c?.impressions ?? 0,
      position: position(c),
      previousPosition: position(p),
    });
  }
  return {
    gainers: movers.filter((m) => m.deltaClicks > 0).sort((a, b) => b.deltaClicks - a.deltaClicks).slice(0, limit),
    losers: movers.filter((m) => m.deltaClicks < 0).sort((a, b) => a.deltaClicks - b.deltaClicks).slice(0, limit),
  };
}

export type WatchRow = {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
  previousPosition: number | null;
  spark: (number | null)[];
  topPage: string | null;
  competingPages: string[];
};

export const SPARK_WEEKS = 12;
const COMPETING_SHARE = 0.2;

export function buildWatchlist(input: {
  targets: string[];
  current: KeyTotals[];
  previous: KeyTotals[];
  daily: KeyDaily[];
  queryPages: KeyTotals[];
  today: string;
}): WatchRow[] {
  const cur = new Map(input.current.map((c) => [c.key, c]));
  const prev = new Map(input.previous.map((p) => [p.key, p]));
  const sparkFrom = bucketStart(addDays(input.today, -(SPARK_WEEKS * 7 - 1)), "week");

  const pagesByQuery = new Map<string, KeyTotals[]>();
  for (const qp of input.queryPages) {
    const { query, page } = splitQueryPageKey(qp.key);
    const list = pagesByQuery.get(query) ?? [];
    list.push({ ...qp, key: page });
    pagesByQuery.set(query, list);
  }

  return input.targets.map((query) => {
    const c = cur.get(query);
    const daily: DailyTotal[] = input.daily.filter((d) => d.key === query);
    const weeks = bucketize(daily, { from: sparkFrom, to: input.today, granularity: "week", today: input.today });
    const pages = (pagesByQuery.get(query) ?? []).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
    const totalImpressions = summarize(pages).impressions;
    return {
      query,
      clicks: c?.clicks ?? 0,
      impressions: c?.impressions ?? 0,
      position: position(c),
      previousPosition: position(prev.get(query)),
      spark: weeks.filter((w) => !w.partial).map((w) => w.position),
      topPage: pages[0]?.key ?? null,
      competingPages: pages
        .slice(1)
        .filter((p) => totalImpressions > 0 && p.impressions / totalImpressions >= COMPETING_SHARE)
        .map((p) => p.key),
    };
  });
}
