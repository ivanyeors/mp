/**
 * Reads that must see every row.
 *
 * Supabase answers at most max-rows (1,000) rows and drops the rest without an
 * error, so a report that reads one page reports on part of the data and looks
 * right. Every read here pages through `.range()` until a short page. Paging
 * needs a total order, so each query must sort on a unique column last.
 */

type Rows<T> = { data: T[] | null; error: { message: string } | null };
export type Pageable<T> = { range(from: number, to: number): PromiseLike<Rows<T>> };

export const PAGE_ROWS = 1000;

function rowsOrThrow<T>({ data, error }: Rows<T>): T[] {
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Every row of `query()`, a page at a time. `query` must order on a unique column. */
export async function selectAll<T>(query: () => Pageable<T>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = rowsOrThrow(await query().range(rows.length, rows.length + PAGE_ROWS - 1));
    rows.push(...page);
    if (page.length < PAGE_ROWS) return rows;
  }
}

// `.in()` is serialised into the request URL, which fails past a few hundred
// ids, so ids go in chunks and each chunk is paged like any other read.
const IN_CHUNK = 100;

/** Every row matching `ids`, chunked and paged. `query` must order on a unique column. */
export async function selectAllIn<T, K extends string | number>(
  ids: readonly K[],
  query: (ids: K[]) => Pageable<T>,
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) {
    const chunk = unique.slice(i, i + IN_CHUNK);
    rows.push(...(await selectAll(() => query(chunk))));
  }
  return rows;
}
