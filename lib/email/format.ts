// ============================================================
// Value formatting for email templates
// ============================================================

import { formatCurrency } from "@/lib/i18n/currencies";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Format money for a PLAIN-TEXT body.
 *
 * The fallback branch interpolates `currency` verbatim, which is a DB-sourced
 * string — safe in text, never safe in HTML. Use {@link moneyHtml} for HTML.
 */
export function money(amount: number, currency: string): string {
  try {
    return formatCurrency(amount, currency);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/** Human date in Singapore time (the business is SG), from a timestamptz ISO string. */
export function formatSgDate(iso: string): string {
  // Shift to SGT, then read the UTC parts so the calendar day is SG's, not the
  // server's.
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
