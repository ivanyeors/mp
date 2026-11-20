import type { ReadjustmentPolicy } from "@/lib/pricing/service-prices";

export type ReadjustablePurchase = {
  source: "platform" | "unlisted";
  orderItemId: string | null;
  productType: "pillow" | "bolster";
  tier: "basic" | "premium" | null;
  paidAt: string | null;
  units: number;
};

export type ReadjustmentQuote =
  | {
      complimentary: true;
      fee: 0;
      seq: number;
      freeUntil: string;
    }
  | {
      complimentary: false;
      fee: number;
      reason: "unlisted" | "not_premium" | "no_free_visits" | "window_ended" | "free_visit_used";
      windowEndedOn?: string;
    };

export function isFreeVisit(quote: Pick<ReadjustmentQuote, "complimentary" | "fee">): boolean {
  return quote.complimentary || quote.fee <= 0;
}

const SGT = "Asia/Singapore";

export function sgtDate(at: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SGT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof at === "string" ? new Date(at) : at);
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function evaluateReadjustment(
  purchase: ReadjustablePurchase,
  usedSeqs: readonly number[],
  policy: ReadjustmentPolicy,
  fee: number,
  today: string,
): ReadjustmentQuote {
  if (purchase.source !== "platform" || !purchase.orderItemId) {
    return { complimentary: false, fee, reason: "unlisted" };
  }
  if (purchase.productType !== "pillow" || purchase.tier !== "premium" || !purchase.paidAt) {
    return { complimentary: false, fee, reason: "not_premium" };
  }
  const allowed = Math.max(0, policy.freeVisits) * Math.max(0, purchase.units);
  if (allowed === 0) {
    return { complimentary: false, fee, reason: "no_free_visits" };
  }
  const freeUntil = addDays(sgtDate(purchase.paidAt), policy.freeWindowDays);
  if (today > freeUntil) {
    return { complimentary: false, fee, reason: "window_ended", windowEndedOn: freeUntil };
  }
  const used = new Set(usedSeqs);
  for (let seq = 1; seq <= allowed; seq++) {
    if (!used.has(seq)) return { complimentary: true, fee: 0, seq, freeUntil };
  }
  return { complimentary: false, fee, reason: "free_visit_used" };
}
