type Rows<T> = { data: T[] | null; error: { message: string } | null };
export type Pageable<T> = { range(from: number, to: number): PromiseLike<Rows<T>> };

export const PAGE_ROWS = 1000;

function rowsOrThrow<T>({ data, error }: Rows<T>): T[] {
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function selectAll<T>(query: () => Pageable<T>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const page = rowsOrThrow(await query().range(rows.length, rows.length + PAGE_ROWS - 1));
    rows.push(...page);
    if (page.length < PAGE_ROWS) return rows;
  }
}

const IN_CHUNK = 100;

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
