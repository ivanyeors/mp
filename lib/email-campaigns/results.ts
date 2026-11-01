/**
 * Results per campaign (PRD-campaign-audiences slice 11; retention metric
 * M22), pure.
 *
 * What the people sent a campaign did next: clicked, unsubscribed from it,
 * marked it as spam, and bought within 30 days of being sent it. A purchase is
 * the CRM's **Purchase** (a counted Order with a goods line), never a
 * re-adjustment fee; its total is net of refunds. Each number is split by the
 * Lifecycle stage the person had when sent (`stage_at_send`), since the stage
 * moves. Rates are over people sent, never over opens, and show a dash when
 * nobody was.
 *
 * A purchase after an email is not proof the email caused it. The holdout
 * says more: a campaign that keeps sending may hold out 10% of the people it
 * would send to (`campaign_holdout_bucket`, the claim), and their 30-day
 * purchase rate is set beside that of the people sent in the same weeks.
 *
 * The rows come from `email_campaign_stage_results` (20261031162653).
 */

import { LIFECYCLE_STAGE_LABEL, LIFECYCLE_STAGES, type LifecycleStage } from "@/lib/crm/lifecycle-stage";

/** A purchase counts when paid within this many days after the send. */
export const RESULT_WINDOW_DAYS = 30;
/** Of the people a holding-out campaign would send to, the share held out: `campaign_holdout_bucket(id) < 10`. */
export const HOLDOUT_PERCENT = 10;
/** The holdout is offered once a campaign has been sent to this many (owner decision 5). */
export const HOLDOUT_MIN_SENT = 500;
/** Two-sided 95%: past this, the difference is unlikely to be chance. */
const Z_95 = 1.96;

export type ResultStage = LifecycleStage | "unknown";
export const RESULT_STAGES: readonly ResultStage[] = [...LIFECYCLE_STAGES, "unknown"];
export const RESULT_STAGE_LABEL: Record<ResultStage, string> = {
  ...LIFECYCLE_STAGE_LABEL,
  unknown: "Not recorded",
};

export type ResultCohort = "sent" | "held_out" | "sent_since_holdout";

export interface ResultNumbers {
  people: number;
  clicked: number;
  unsubscribed: number;
  complained: number;
  /** People who bought within 30 days of being sent it. */
  bought: number;
  /** Of `bought`, those whose purchase came after their first click. */
  boughtAfterClick: number;
  /** What those purchases came to, in S$, net of refunds. */
  boughtTotal: number;
  /** People sent it under 30 days ago: their window is still open. */
  counting: number;
}

export interface StageResult extends ResultNumbers {
  stage: ResultStage;
}

export interface HoldoutComparison {
  heldOut: ResultNumbers;
  /** The people sent it since the first person was held out: the same weeks. */
  sent: ResultNumbers;
  /** Percentage points, sent's purchase rate less the held out's; null when either group is empty. */
  difference: number | null;
  /** Whether the difference is past what chance explains at 95%. */
  clear: boolean;
}

export interface CampaignResults {
  /** Everyone it was sent to. */
  total: ResultNumbers;
  /** The same, by the stage each person had when sent: in funnel order, only stages with someone. */
  byStage: StageResult[];
  /** Null when nobody was held out. */
  holdout: HoldoutComparison | null;
}

export const NO_RESULTS: ResultNumbers = {
  people: 0,
  clicked: 0,
  unsubscribed: 0,
  complained: 0,
  bought: 0,
  boughtAfterClick: 0,
  boughtTotal: 0,
  counting: 0,
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const isStage = (v: unknown): v is ResultStage => typeof v === "string" && (RESULT_STAGES as readonly string[]).includes(v);
const isCohort = (v: unknown): v is ResultCohort => v === "sent" || v === "held_out" || v === "sent_since_holdout";

function add(a: ResultNumbers, b: ResultNumbers): ResultNumbers {
  return {
    people: a.people + b.people,
    clicked: a.clicked + b.clicked,
    unsubscribed: a.unsubscribed + b.unsubscribed,
    complained: a.complained + b.complained,
    bought: a.bought + b.bought,
    boughtAfterClick: a.boughtAfterClick + b.boughtAfterClick,
    boughtTotal: Math.round((a.boughtTotal + b.boughtTotal) * 100) / 100,
    counting: a.counting + b.counting,
  };
}

/** Pure — one `email_campaign_stage_results` row's numbers. */
export function numbersFromRow(row: Record<string, unknown>): ResultNumbers {
  return {
    people: num(row.people),
    clicked: num(row.clicked),
    unsubscribed: num(row.unsubscribed),
    complained: num(row.complained),
    bought: num(row.bought),
    boughtAfterClick: num(row.bought_after_click),
    boughtTotal: num(row.bought_total),
    counting: num(row.counting),
  };
}

/** Pure — a campaign's `email_campaign_stage_results` rows as its results. Unknown cohorts and stages are skipped. */
export function resultsFromRows(rows: readonly Record<string, unknown>[]): CampaignResults {
  const by: Record<ResultCohort, Map<ResultStage, ResultNumbers>> = {
    sent: new Map(),
    held_out: new Map(),
    sent_since_holdout: new Map(),
  };
  for (const row of rows) {
    if (!isCohort(row.cohort) || !isStage(row.stage)) continue;
    const m = by[row.cohort];
    m.set(row.stage, add(m.get(row.stage) ?? NO_RESULTS, numbersFromRow(row)));
  }
  const sum = (m: Map<ResultStage, ResultNumbers>) => [...m.values()].reduce(add, NO_RESULTS);
  const heldOut = sum(by.held_out);
  return {
    total: sum(by.sent),
    byStage: RESULT_STAGES.flatMap((stage) => {
      const n = by.sent.get(stage);
      return n && n.people > 0 ? [{ stage, ...n }] : [];
    }),
    holdout: heldOut.people > 0 ? compareHoldout(heldOut, sum(by.sent_since_holdout)) : null,
  };
}

/** Pure — `n` of `of` as a fraction, or null when nobody is in `of`: a dash, never 0%. */
export function rate(n: number, of: number): number | null {
  return of > 0 ? n / of : null;
}

/** Pure — a rate as people read it: a dash for none, one decimal under 10%, whole above. */
export function formatRate(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return "—";
  const pct = r * 100;
  if (pct === 0) return "0%";
  if (pct < 10) return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
  return `${Math.round(pct)}%`;
}

/** Pure — S$ in whole dollars, as the demo reads: S$2,140. */
export function formatSgd(amount: number): string {
  return `S$${Math.round(amount).toLocaleString("en-SG")}`;
}

/**
 * Pure — the held out beside the people sent in the same weeks, on the
 * 30-day purchase rate: a two-proportion z-test, so a difference is called
 * clear only past what chance explains at 95%.
 */
export function compareHoldout(heldOut: ResultNumbers, sent: ResultNumbers): HoldoutComparison {
  const a = rate(sent.bought, sent.people);
  const b = rate(heldOut.bought, heldOut.people);
  if (a === null || b === null) return { heldOut, sent, difference: null, clear: false };
  const pooled = (sent.bought + heldOut.bought) / (sent.people + heldOut.people);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / sent.people + 1 / heldOut.people));
  const clear = se > 0 && Math.abs((a - b) / se) >= Z_95;
  return { heldOut, sent, difference: Math.round((a - b) * 1000) / 10, clear };
}

/** Pure — what the comparison means, in one sentence. */
export function holdoutVerdict(c: HoldoutComparison): string {
  if (c.difference === null) return "Nobody has been sent it since the holdout began, so there is nothing to compare yet.";
  if (!c.clear) return "Too close to call: at these numbers the difference could be chance.";
  return c.difference > 0
    ? "People sent it bought more than those held out, by more than chance explains."
    : "People held out bought more than those sent it, by more than chance explains.";
}

/** Pure — why a campaign cannot hold out yet, or null when it can. */
export function holdoutBlocker(c: { keepSending: boolean }, handed: number): string | null {
  if (!c.keepSending) return "Only a campaign that keeps sending can hold people out.";
  if (handed < HOLDOUT_MIN_SENT) {
    return `A holdout is offered once ${HOLDOUT_MIN_SENT.toLocaleString("en-SG")} people have been sent it (${handed.toLocaleString("en-SG")} so far): below that, the numbers say little.`;
  }
  return null;
}

/** Pure — whether a Customer in this bucket (0–99, `campaign_holdout_bucket`) is held out while a holdout is on. */
export const inHoldout = (bucket: number | null | undefined): boolean =>
  typeof bucket === "number" && bucket >= 0 && bucket < HOLDOUT_PERCENT;
