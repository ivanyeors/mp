export const SCHEDULE_COMMISSION_POOL = 50;

export type PartnerTerms = {
  pool: number;
  choice: number | null;
  nextChoice: number | null;
  nextChoiceFrom: string | null;
  customerDiscount: boolean;
};

export const PARTNER_TERMS_COLUMNS =
  "commission_pool, commission_choice, commission_choice_next, commission_choice_next_from, customer_discount_enabled";

export type PartnerTermsRow = {
  commission_pool?: number | string | null;
  commission_choice?: number | string | null;
  commission_choice_next?: number | string | null;
  commission_choice_next_from?: string | null;
  customer_discount_enabled?: boolean | null;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function money(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
}

export function partnerTermsOf(row: PartnerTermsRow): PartnerTerms {
  return {
    pool: money(row.commission_pool) ?? SCHEDULE_COMMISSION_POOL,
    choice: money(row.commission_choice),
    nextChoice: money(row.commission_choice_next),
    nextChoiceFrom: row.commission_choice_next_from ? String(row.commission_choice_next_from).slice(0, 10) : null,
    customerDiscount: row.customer_discount_enabled === true,
  };
}

export function sgtDate(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

function ymd(y: number, monthIndex: number, d: number): string {
  return new Date(Date.UTC(y, monthIndex, d)).toISOString().slice(0, 10);
}

export function payoutDateOf(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const back = last.getUTCDay() === 0 ? 2 : last.getUTCDay() === 6 ? 1 : 0;
  return ymd(year, month - 1, last.getUTCDate() - back);
}

export function nextPayoutDate(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const thisMonth = payoutDateOf(y, m);
  if (thisMonth >= today) return thisMonth;
  return m === 12 ? payoutDateOf(y + 1, 1) : payoutDateOf(y, m + 1);
}

export function choiceChangeStartsOn(today: string): string {
  const [y, m, d] = nextPayoutDate(today).split("-").map(Number);
  return ymd(y, m - 1, d + 1);
}

export function choiceInEffect(terms: PartnerTerms, today: string): number | null {
  return terms.nextChoiceFrom && terms.nextChoiceFrom <= today ? terms.nextChoice : terms.choice;
}

export function commissionInEffect(terms: PartnerTerms, today: string): number {
  const choice = choiceInEffect(terms, today);
  return round2(Math.min(choice ?? terms.pool, terms.pool));
}

export function customerDiscountInEffect(terms: PartnerTerms, today: string): number {
  if (!terms.customerDiscount) return 0;
  return round2(Math.max(0, terms.pool - commissionInEffect(terms, today)));
}

export function referralDiscountFor(
  terms: PartnerTerms,
  build: { productType: string; tier?: string | null },
  today: string,
): number {
  return isEligibleBuild(build) ? customerDiscountInEffect(terms, today) : 0;
}

export type ChoiceUpdate = {
  commission_choice: number | null;
  commission_choice_next: number | null;
  commission_choice_next_from: string | null;
};

export function pickCommission(terms: PartnerTerms, picked: number | null, today: string): ChoiceUpdate {
  const current = choiceInEffect(terms, today);
  const rounded = picked == null ? null : round2(Math.max(0, picked));
  const wanted = rounded == null || rounded >= terms.pool ? null : rounded;
  const paid = (choice: number | null) => Math.min(choice ?? terms.pool, terms.pool);
  if (paid(wanted) === paid(current)) {
    return { commission_choice: current, commission_choice_next: null, commission_choice_next_from: null };
  }
  return {
    commission_choice: current,
    commission_choice_next: wanted,
    commission_choice_next_from: choiceChangeStartsOn(today),
  };
}

export function isEligibleBuild(build: { productType: string; tier?: string | null }): boolean {
  return build.productType === "pillow" && build.tier === "premium";
}

export type CommissionOrderItem = {
  kind?: string | null;
  customization_snapshot?: {
    result_id?: string | null;
    product_type?: string | null;
    assigned_tier?: string | null;
  } | null;
};

export function isEligibleOrderItem(item: CommissionOrderItem): boolean {
  if ((item.kind ?? "goods") !== "goods") return false;
  const snap = item.customization_snapshot;
  if (!snap?.result_id) return false;
  return isEligibleBuild({ productType: snap.product_type ?? "", tier: snap.assigned_tier ?? null });
}
