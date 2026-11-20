import { canonicalAt } from "@/lib/crm/timeline/merge";
import type { TimelineBatch, TimelineEntry } from "@/lib/crm/timeline/types";

export interface BoundedQuery
  extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  not(column: string, operator: "is", value: null): BoundedQuery;
  lte(column: string, value: string): BoundedQuery;
  order(column: string, options: { ascending: boolean }): BoundedQuery;
  limit(count: number): BoundedQuery;
}

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

export async function readStream<Row extends object>(
  query: BoundedQuery,
  column: keyof Row & string,
  before: string | null,
  limit: number,
  toEntry: (row: Row) => TimelineEntry | null,
): Promise<TimelineBatch> {
  return streamBatch(await newestRows<Row>(query, column, before, limit), column, limit, toEntry);
}

export function joinBatches(batches: readonly TimelineBatch[]): TimelineBatch {
  let floor: string | null = null;
  for (const b of batches) {
    const f = b.floor === null ? null : canonicalAt(b.floor);
    if (f !== null && (floor === null || f > floor)) floor = f;
  }
  return { entries: batches.flatMap((b) => b.entries), floor };
}

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
