import { formatCurrency } from "@/lib/i18n/currencies";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function money(amount: number, currency: string): string {
  try {
    return formatCurrency(amount, currency, { display: "code" });
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function negativeMoney(amount: number, currency: string): string {
  return `− ${money(Math.abs(amount), currency)}`;
}

export function formatSgDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
