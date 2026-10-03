/** Composite keys for `seo_daily_metrics`. No deps: safe in client bundles.
 *
 * Tab cannot appear in a GSC query or a URL, so it is a safe separator. */
export const QUERY_PAGE_SEPARATOR = "\t";

export function queryPageKey(query: string, page: string): string {
  return `${query}${QUERY_PAGE_SEPARATOR}${page}`;
}

export function splitQueryPageKey(key: string): { query: string; page: string } {
  const i = key.indexOf(QUERY_PAGE_SEPARATOR);
  return i === -1 ? { query: key, page: "" } : { query: key.slice(0, i), page: key.slice(i + 1) };
}

