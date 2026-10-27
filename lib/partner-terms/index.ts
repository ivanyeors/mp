/**
 * A partner's commission terms under the Referral Partner Agreement (ADR 0034).
 * PURE — no I/O — so the hub, the admin editors, the checkout code check, the
 * hold and capture all read one set of rules, and the tests can too.
 *
 * The Schedule: a flat Commission Pool (S$50) per Qualifying Sale. The partner
 * takes the pool or any lower amount they pick in the Partner Hub (clause 7.2);
 * a changed pick starts the day after the next Payout Date. What the partner
 * leaves is Mpillow's, and Staff decide per partner whether it comes off a
 * referred customer's order (clause 5.1: the offer is Mpillow's, never the
 * partner's). Only a customised premium pillow makes a sale qualify.
 */

/** The Schedule's Commission Pool, prefilled when Staff approve a partner. */
export const SCHEDULE_COMMISSION_POOL = 50;

export type PartnerTerms = {
  /** Commission Pool per Qualifying Sale. */
  pool: number;
  /** The partner's pick; null = the whole pool. */
  choice: number | null;
  /** A pick waiting to start; null = the whole pool. Read only with `nextChoiceFrom`. */
  nextChoice: number | null;
  /** YYYY-MM-DD the waiting pick starts; null = nothing waiting. */
  nextChoiceFrom: string | null;
  /** Staff toggle: the pool the partner leaves comes off the customer's order. */
  customerDiscount: boolean;
};

/** The `partners` columns the terms are read from. */
export const PARTNER_TERMS_COLUMNS =
  "commission_pool, commission_choice, commission_choice_next, commission_choice_next_from, customer_discount_enabled";

export type PartnerTermsRow = {
  commission_pool?: number | string | null;
  commission_choice?: number | string | null;
  commission_choice_next?: number | string | null;
  commission_choice_next_from?: string | null;
  customer_discount_enabled?: boolean | null;
};

/** Round to cents; money never carries float dust. */
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

/** A moment as its Singapore calendar day, YYYY-MM-DD. */
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

/**
 * The Payout Date of a month: its last business day, Monday to Friday. Public
 * holidays are not skipped; Staff pay by hand and can pay a day early.
 */
export function payoutDateOf(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)); // day 0 of the next month
  const back = last.getUTCDay() === 0 ? 2 : last.getUTCDay() === 6 ? 1 : 0;
  return ymd(year, month - 1, last.getUTCDate() - back);
}

/** The first Payout Date on or after `today` (YYYY-MM-DD). */
export function nextPayoutDate(today: string): string {
  const [y, m] = today.split("-").map(Number);
  const thisMonth = payoutDateOf(y, m);
  if (thisMonth >= today) return thisMonth;
  return m === 12 ? payoutDateOf(y + 1, 1) : payoutDateOf(y, m + 1);
}

/** The day a pick changed on `today` starts: the day after the next Payout Date (clause 7.2). */
export function choiceChangeStartsOn(today: string): string {
  const [y, m, d] = nextPayoutDate(today).split("-").map(Number);
  return ymd(y, m - 1, d + 1);
}

/** The pick in force on `today`: the waiting one once its day has come. */
export function choiceInEffect(terms: PartnerTerms, today: string): number | null {
  return terms.nextChoiceFrom && terms.nextChoiceFrom <= today ? terms.nextChoice : terms.choice;
}

/** The partner's commission per Qualifying Sale on `today`: their pick, never above the pool. */
export function commissionInEffect(terms: PartnerTerms, today: string): number {
  const choice = choiceInEffect(terms, today);
  return round2(Math.min(choice ?? terms.pool, terms.pool));
}

/** What a referred customer gets off on `today`: the pool the partner leaves, when Staff turned it on. */
export function customerDiscountInEffect(terms: PartnerTerms, today: string): number {
  if (!terms.customerDiscount) return 0;
  return round2(Math.max(0, terms.pool - commissionInEffect(terms, today)));
}

/**
 * What a referred customer gets off a build on `today`: the partner's unused pool,
 * and only on a build that makes the sale qualify, since the pool exists only for
 * a Qualifying Sale.
 */
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

/**
 * The columns to write when the partner picks `picked` on `today` (null or the
 * whole pool = take the whole pool). A waiting pick whose day has come is folded
 * in first. Picking what is already in force cancels a waiting change; anything
 * else waits for the day after the next Payout Date.
 */
export function pickCommission(terms: PartnerTerms, picked: number | null, today: string): ChoiceUpdate {
  const current = choiceInEffect(terms, today);
  const rounded = picked == null ? null : round2(Math.max(0, picked));
  const wanted = rounded == null || rounded >= terms.pool ? null : rounded;
  // Compared as paid: a pick above a since-lowered pool pays the pool.
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

/** The build a sale needs to qualify: a customised premium pillow (the Schedule's Eligible Product). */
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

/** An order line that is an Eligible Product: a customisation's premium pillow, never a service. */
export function isEligibleOrderItem(item: CommissionOrderItem): boolean {
  if ((item.kind ?? "goods") !== "goods") return false;
  const snap = item.customization_snapshot;
  if (!snap?.result_id) return false;
  return isEligibleBuild({ productType: snap.product_type ?? "", tier: snap.assigned_tier ?? null });
}
