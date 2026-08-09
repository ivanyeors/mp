// ============================================================
// Value formatting for email templates
// ============================================================

import { formatCurrency } from "@/lib/i18n/currencies";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Localised money, e.g. `$389.00`. What the order/RMA templates have always
 * used (via `formatCurrency`), so their copy is unchanged.
 */
export function money(amount: number, currency: string): string {
  try {
    return formatCurrency(amount, currency);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Money with an explicit currency code, e.g. `SGD 389.00`.
 *
 * The configurator emails quote an amount we are about to place a card
 * authorization for, and the shop sells in SGD/MYR/USD/CNY. `Intl` renders SGD
 * in en-SG as a bare `$`, which a reader cannot tell from USD — so these
 * templates keep the code, exactly as the route handlers emitted it before the
 * rendering moved into lib/email.
 *
 * (The order templates arguably want this too, but changing them would rewrite
 * customer-facing copy, which is out of scope for a design pass.)
 */
export function moneyWithCode(amount: number, currency: string): string {
  return `${currency} ${amount.toFixed(2)}`;
}

/** Human date in Singapore time (the business is SG), from a timestamptz ISO string. */
export function formatSgDate(iso: string): string {
  // Shift to SGT, then read the UTC parts so the calendar day is SG's, not the
  // server's.
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
