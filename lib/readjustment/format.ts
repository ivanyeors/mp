import type { ReadjustmentQuote } from "@/lib/readjustment/eligibility";

export type QuoteBadgeStrings = {
  badgeFree: string;
  badgeFee: string;
  badgeFreeUsed: string;
  badgeWindowEnded: string;
};

export function formatSgd(n: number): string {
  return `SGD ${n.toFixed(2)}`;
}

export function shortDate(ymdOrIso: string, locale: string): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(ymdOrIso) ? new Date(`${ymdOrIso}T12:00:00+08:00`) : new Date(ymdOrIso);
  return new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function quoteBadge(quote: ReadjustmentQuote, t: QuoteBadgeStrings, locale: string): string {
  if (quote.complimentary) return t.badgeFree.replace("{date}", shortDate(quote.freeUntil, locale));
  const fee = formatSgd(quote.fee);
  if (quote.reason === "free_visit_used") return t.badgeFreeUsed.replace("{fee}", fee);
  if (quote.reason === "window_ended" && quote.windowEndedOn) {
    return t.badgeWindowEnded.replace("{fee}", fee).replace("{date}", shortDate(quote.windowEndedOn, locale));
  }
  return t.badgeFee.replace("{fee}", fee);
}
