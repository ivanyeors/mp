// ============================================================
// Value formatting for email templates
// ============================================================

import { formatCurrency } from "@/lib/i18n/currencies";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Money for every outbound email, e.g. `SGD 1,234.50`.
 *
 * ONE formatter for all templates. Emails quote amounts that are read out of
 * context — an authorization hold days before it is captured, a receipt filed
 * and reopened later — and the shop sells in SGD/MYR/USD/CNY. Intl renders SGD
 * in en-SG as a bare `$`, indistinguishable from USD, so email always carries
 * the explicit ISO code. On-site surfaces keep the symbol.
 *
 * The catch is for a malformed currency code out of the DB, which is the only
 * input that makes Intl throw.
 */
export function money(amount: number, currency: string): string {
  try {
    return formatCurrency(amount, currency, { display: "code" });
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * A deduction on a totals table, e.g. `− SGD 40.00`.
 *
 * The sign is U+2212 MINUS SIGN followed by a space, NOT a hyphen prefix. Since
 * money() carries the ISO code, `-SGD 40.00` glues the hyphen to letters and
 * reads as a compound word rather than a negative amount; the separated true
 * minus is unambiguous and still aligns in the right-aligned mono column.
 */
export function negativeMoney(amount: number, currency: string): string {
  return `− ${money(Math.abs(amount), currency)}`;
}

/** Human date in Singapore time (the business is SG), from a timestamptz ISO string. */
export function formatSgDate(iso: string): string {
  // Shift to SGT, then read the UTC parts so the calendar day is SG's, not the
  // server's.
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
