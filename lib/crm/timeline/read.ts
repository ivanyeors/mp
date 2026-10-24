import { canonicalAt } from "@/lib/crm/timeline/merge";
import type { TimelineBatch, TimelineEntry } from "@/lib/crm/timeline/types";

/**
 * Bounded reads for timeline adapters. A stream is one query over one timestamp
 * column: the newest `limit` rows at or before the cursor, newest first. A row
 * with several dated facts (an order is placed, paid, shipped…) is one stream
 * per column, so an old order delivered yesterday is found by its delivery.
 */

/** The part of a PostgREST filter builder a bounded read uses. */
export interface BoundedQuery
  extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  not(column: string, operator: "is", value: null): BoundedQuery;
  lte(column: string, value: string): BoundedQuery;
  order(column: string, options: { ascending: boolean }): BoundedQuery;
  limit(count: number): BoundedQuery;
}

/** The newest `limit` rows whose `column` is set and at or before `before`. Throws on a query error. */
export async function newestRows<Row>(
  query: BoundedQuery,
  column: string,
  before: string | null,
  limit: number,
): Promise<Row[]> {
  let q = query.not(column, "is", null);
  if (before) q = q.lte(column, before);
  const { data, error } = await q.order(column, { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}

/**
 * One stream's rows as a batch: an entry per row (or none), and the row's
 * `column` as the floor when the read came back full.
 */
export function streamBatch<Row extends object>(
  rows: readonly Row[],
  column: keyof Row & string,
  limit: number,
  toEntry: (row: Row) => TimelineEntry | null,
): TimelineBatch {
  const last = rows[rows.length - 1];
  return {
    entries: rows.map(toEntry).filter((e): e is TimelineEntry => e !== null),
    floor: rows.length >= limit && last ? String(last[column]) : null,
  };
}

/** {@link newestRows} then {@link streamBatch}: a whole stream in one call. */
export async function readStream<Row extends object>(
  query: BoundedQuery,
  column: keyof Row & string,
  before: string | null,
  limit: number,
  toEntry: (row: Row) => TimelineEntry | null,
): Promise<TimelineBatch> {
  return streamBatch(await newestRows<Row>(query, column, before, limit), column, limit, toEntry);
}

/** One adapter's streams as one batch: every entry, under the highest floor. */
export function joinBatches(batches: readonly TimelineBatch[]): TimelineBatch {
  let floor: string | null = null;
  for (const b of batches) {
    const f = b.floor === null ? null : canonicalAt(b.floor);
    if (f !== null && (floor === null || f > floor)) floor = f;
  }
  return { entries: batches.flatMap((b) => b.entries), floor };
}

/**
 * A batch from a capped read of everything a Customer has in one table (their
 * Results, their bookings: a handful each), keeping the entries at or before
 * `before`. When the cap was reached, the oldest row read is the floor.
 */
export function cappedBatch(
  entries: readonly TimelineEntry[],
  before: string | null,
  capped: string | null,
): TimelineBatch {
  const cut = before === null ? null : canonicalAt(before);
  return {
    entries: entries.filter((e) => {
      const at = canonicalAt(e.at);
      return at !== null && (cut === null || at <= cut);
    }),
    floor: capped,
  };
}
