import { addDays } from "@/lib/seo-metrics/dates";

/**
 * Rollups over `seo_daily_metrics` (slice 02, PRD-search-visibility). Pure:
 * the server action loads rows, everything numeric happens here.
 *
 * CTR and position are always recomputed from sums — never averaged across rows:
 *   ctr      = Σclicks / Σimpressions
 *   position = Σposition_sum / Σimpressions   (impression-weighted)
 */

export type DailyTotal = {
  date: string; // YYYY-MM-DD
  clicks: number;
  impressions: number;
  position_sum: number;
};

export type Totals = {
  clicks: number;
  impressions: number;
  /** null when there were no impressions — not 0, which would read as "terrible". */
  ctr: number | null;
  position: number | null;
};

export type Granularity = "day" | "week";

export type Bucket = Totals & {
  /** First day of the bucket (Monday for weeks). */
  start: string;
  /** Contains a day GSC may still revise (within REPORTING_LAG_DAYS of today). */
  partial: boolean;
};

/** GSC numbers for the most recent days keep changing; mark them as partial. */
export const REPORTING_LAG_DAYS = 3;

export function summarize(rows: Pick<DailyTotal, "clicks" | "impressions" | "position_sum">[]): Totals {
  let clicks = 0;
  let impressions = 0;
  let positionSum = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    positionSum += r.position_sum;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: impressions > 0 ? positionSum / impressions : null,
  };
}

function dayOfWeekMonday0(isoDate: string): number {
  return (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export function bucketStart(isoDate: string, granularity: Granularity): string {
  return granularity === "day" ? isoDate : addDays(isoDate, -dayOfWeekMonday0(isoDate));
}

/**
 * One bucket per day/week across [from, to], including empty ones (zeros, null
 * ratios) so gaps show as gaps rather than the line silently skipping time.
 */
export function bucketize(
  rows: DailyTotal[],
  opts: { from: string; to: string; granularity: Granularity; today: string },
): Bucket[] {
  const partialFrom = addDays(opts.today, -(REPORTING_LAG_DAYS - 1));
  const byBucket = new Map<string, DailyTotal[]>();
  for (const r of rows) {
    if (r.date < opts.from || r.date > opts.to) continue;
    const key = bucketStart(r.date, opts.granularity);
    const list = byBucket.get(key);
    if (list) list.push(r);
    else byBucket.set(key, [r]);
  }

  const step = opts.granularity === "day" ? 1 : 7;
  const buckets: Bucket[] = [];
  for (let start = bucketStart(opts.from, opts.granularity); start <= opts.to; start = addDays(start, step)) {
    const end = addDays(start, step - 1);
    buckets.push({
      start,
      ...summarize(byBucket.get(start) ?? []),
      partial: end >= partialFrom,
    });
  }
  return buckets;
}

export type Delta = {
  /** Relative change for counts, absolute for ratios; null when there is no baseline. */
  value: number | null;
  /** Whether the change is good for the business (position: lower is better). */
  direction: "better" | "worse" | "flat" | null;
};

const FLAT = 1e-9;

function direction(change: number, lowerIsBetter = false): Delta["direction"] {
  if (Math.abs(change) < FLAT) return "flat";
  return change > 0 !== lowerIsBetter ? "better" : "worse";
}

export function compareTotals(current: Totals, previous: Totals): Record<keyof Totals, Delta> {
  const relative = (cur: number, prev: number): Delta =>
    prev > 0 ? { value: (cur - prev) / prev, direction: direction(cur - prev) } : { value: null, direction: null };
  const absolute = (cur: number | null, prev: number | null, lowerIsBetter = false): Delta =>
    cur !== null && prev !== null
      ? { value: cur - prev, direction: direction(cur - prev, lowerIsBetter) }
      : { value: null, direction: null };
  return {
    clicks: relative(current.clicks, previous.clicks),
    impressions: relative(current.impressions, previous.impressions),
    ctr: absolute(current.ctr, previous.ctr),
    position: absolute(current.position, previous.position, true),
  };
}

/** The window of equal length immediately before [from, to]. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/**
 * Daily counts (e.g. imported AI impressions or citations) summed per bucket.
 * Buckets outside the imported span [firstDate, lastDate] are null, not 0:
 * "no export covers this" is not the same as zero appearances. Imports are
 * settled data, so nothing is flagged partial; the panel states the span.
 */
export function sumBuckets(
  rows: { date: string; value: number }[],
  opts: { from: string; to: string; granularity: Granularity; firstDate: string | null; lastDate: string | null },
): { start: string; value: number | null; partial: boolean }[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (r.date < opts.from || r.date > opts.to) continue;
    const key = bucketStart(r.date, opts.granularity);
    sums.set(key, (sums.get(key) ?? 0) + r.value);
  }
  const step = opts.granularity === "day" ? 1 : 7;
  const out: { start: string; value: number | null; partial: boolean }[] = [];
  for (let start = bucketStart(opts.from, opts.granularity); start <= opts.to; start = addDays(start, step)) {
    const end = addDays(start, step - 1);
    const covered =
      opts.firstDate !== null && opts.lastDate !== null && end >= opts.firstDate && start <= opts.lastDate;
    out.push({ start, value: covered ? (sums.get(start) ?? 0) : null, partial: false });
  }
  return out;
}
