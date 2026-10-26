/**
 * Escapes SQL `LIKE`/`ILIKE` wildcards so an `ilike` filter behaves as an exact
 * case-insensitive match. Without this, an email containing `_` (legal in the
 * local part, e.g. `john_doe@x.com`) or `%` would be treated as a wildcard and
 * could match unrelated rows — which would wrongly link guest orders that don't
 * actually belong to the customer (#33).
 *
 * PostgREST also rewrites every `*` in a like/ilike value to `%`, so `*` needs
 * escaping too. `\*` arrives in Postgres as `\%`, a literal percent sign.
 * ponytail: there is no way to send a literal `*`, so an address containing one
 * never matches its own row; such addresses are vanishingly rare.
 *
 * Pure, with no imports, so client code can share a module that uses it (the
 * Customers list's filters, lib/crm/customer-filters.ts). Server code still
 * imports it from lib/auth/customer-identity.ts, which re-exports it.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_*]/g, (ch) => `\\${ch}`);
}

/**
 * Make a free-text search term safe to interpolate into a PostgREST `.or()`
 * filter string. `.or(...)` is a query language, not a value slot: a comma ends
 * one `column.op.value` condition and begins the next, parentheses group a logic
 * tree, and `% _ *` are `ilike` wildcards. Dropped in raw (the hole this closes),
 * `?search=x,cost_price.gte.100` injects a condition the caller can toggle by
 * result count — a blind boolean oracle over a column the select never returns
 * but Postgres still filters on.
 *
 * Strip every character that could break out of a single `ilike` value
 * (`, ( ) % _ * \ "`), leaving a plain case-insensitive substring match, and
 * cap the length (the term is the only unbounded part of the query). This
 * over-removes rather than escaping, so there is no ambiguity about what the
 * surviving string can express — unlike `escapeLikePattern`, which is for a
 * single `.ilike()` value, not a raw `.or()` string. Callers drop the filter
 * entirely when the result is empty.
 */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()%_*\\"]/g, "").trim().slice(0, 100);
}
