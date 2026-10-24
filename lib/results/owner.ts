/**
 * Whose Result is this? The one rule the storefront's access gate
 * (`authorizeResultAccess`, lib/results/access.ts) and the Customer timeline
 * (CRM slice 03, ADR 0028) share, so the timeline never shows Staff a Result on
 * a Customer whose own login could not open it.
 *
 * A Result is a Customer's when its `customer_id` is theirs, or when its
 * `customer_email` is their email, even when `customer_id` is set: a guest
 * Result carries only the email. Emails compare ignoring case and surrounding
 * whitespace, because neither is part of an address. Nothing looser: an email
 * that merely contains theirs is someone else's.
 */

/** An email as Results compare it, or null when there is none. */
export function normaliseResultEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

export function isCustomersResult(
  customer: { id: string; email: string | null },
  row: { customer_id: string | null; customer_email: string | null },
): boolean {
  if (row.customer_id !== null && row.customer_id === customer.id) return true;
  const mine = normaliseResultEmail(customer.email);
  return mine !== null && mine === normaliseResultEmail(row.customer_email);
}

/**
 * The same email rule as a PostgREST `imatch` pattern, so a query finds a
 * Customer's guest Results without a wildcard: `^\s*<email>\s*$`, matched
 * case-insensitively. Every regex metacharacter in the email is escaped.
 * Callers still check each row with {@link isCustomersResult}.
 */
export function resultEmailPattern(email: string): string | null {
  const mine = normaliseResultEmail(email);
  if (!mine) return null;
  return `^\\s*${mine.replace(/[\\^$.|?*+()[\]{}]/g, (c) => `\\${c}`)}\\s*$`;
}
