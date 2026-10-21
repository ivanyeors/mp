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
