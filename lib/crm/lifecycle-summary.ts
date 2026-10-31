import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABEL,
  LIFECYCLE_STAGE_RULE,
  type LifecycleDetail,
  type LifecycleStage,
} from "@/lib/crm/lifecycle-stage";
import { shareLabel } from "@/lib/format/share";

/**
 * The Customer lifecycle chart on the Customers page (owner, 2026-10-31):
 * every Customer in their **Lifecycle stage** now, each stage's bar split by
 * its sub-status, drawn against all Customers. Counted by
 * `admin_customer_lifecycle_counts` (20261031140000) from the Customer
 * overview, so a stage's count is what the list's *Stage* filter returns.
 *
 * Pure: the chart and its tests read the counts through `lifecycleSummary`;
 * lib/crm/lifecycle-summary-server.ts reads them.
 */

/** One row of `admin_customer_lifecycle_counts`. Counts may arrive as strings. */
export interface LifecycleCountRow {
  stage: string | null;
  detail: string | null;
  undated: boolean | null;
  customers: number | string | null;
}

/** A part of a stage's bar: a sub-status, or `none` for the stage's Customers without one. */
export type LifecyclePartKey = LifecycleDetail | "none";

/** How much ink a part gets in its stage's hue: 1 the lightest step, 3 the most. */
export type LifecycleShade = 1 | 2 | 3;

interface PartDefinition {
  key: LifecyclePartKey;
  label: string;
  /** What being in it means, for the tooltip. */
  means: string;
  shade: LifecycleShade;
  /** The part is *no dates yet* itself: New's buyers with no delivery to show. */
  undatedPart?: true;
}

/**
 * Each stage's parts, in bar order: the order a Customer moves through them,
 * more ink further along. *Lead* and *Lost* have no sub-status.
 */
export const LIFECYCLE_PARTS: Record<LifecycleStage, PartDefinition[]> = {
  lead: [{ key: "none", label: "Lead", means: LIFECYCLE_STAGE_RULE.lead, shade: 3 }],
  new: [
    { key: "awaiting_delivery", label: "Awaiting delivery", means: "Their purchase isn't delivered yet", shade: 1 },
    { key: "delivered", label: "Delivered", means: "Delivered under 30 days ago, inside the return window", shade: 2 },
    { key: "settled", label: "Settled", means: "Delivered 30 days ago or more; the return window has closed", shade: 3 },
    {
      key: "none",
      label: "No dates yet",
      means: "Their purchase was on Shopify; its date comes with the Shopify order history",
      shade: 2,
      undatedPart: true,
    },
  ],
  loyal: [
    { key: "repeat_purchases", label: "Repeat purchases", means: "2 or more purchases", shade: 3 },
    { key: "bookings", label: "Bookings", means: "An attended re-adjustment booking", shade: 1 },
  ],
  at_risk: [
    { key: "none", label: "12 to 24 months", means: "Last purchase or attended booking 12 to 24 months ago", shade: 1 },
    { key: "lapsed", label: "Lapsed", means: "Last purchase or attended booking over 24 months ago", shade: 3 },
  ],
  lost: [{ key: "none", label: "Lost", means: LIFECYCLE_STAGE_RULE.lost, shade: 3 }],
};

export interface LifecyclePart extends PartDefinition {
  customers: number;
  /** Of `customers`, placed by their Shopify-era order count alone: *no dates yet*. */
  undated: number;
}

export interface LifecycleStageSummary {
  stage: LifecycleStage;
  label: string;
  rule: string;
  customers: number;
  /** Of `customers`, placed by their Shopify-era order count alone. 0 for *Lead*, *At risk* and *Lost*. */
  undated: number;
  /** `customers` of every Customer, for display: "59%", "<1%". */
  share: string;
  /** In bar order, empty ones included; the chart leaves them out. */
  parts: LifecyclePart[];
}

export interface LifecycleSummary {
  /** Every Customer: the scale every bar is drawn against. */
  total: number;
  /** The five stages, in funnel order. */
  stages: LifecycleStageSummary[];
}

const count = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const isStage = (v: unknown): v is LifecycleStage => LIFECYCLE_STAGES.includes(v as LifecycleStage);

/**
 * The five stages from the function's rows. A sub-status the stage does not
 * have counts in the stage's `none` part, or its last; a stage the code does
 * not know is left out of the total too, so the bars still add up.
 *
 * *No dates yet* is kept only where it moves nothing visible: *New* and
 * *Loyal*. A *Lost* Customer is placed by their consent, whatever their dates.
 */
export function lifecycleSummary(rows: readonly LifecycleCountRow[]): LifecycleSummary {
  const parts = Object.fromEntries(
    LIFECYCLE_STAGES.map((stage) => [stage, LIFECYCLE_PARTS[stage].map((p) => ({ ...p, customers: 0, undated: 0 }))]),
  ) as Record<LifecycleStage, LifecyclePart[]>;

  for (const row of rows) {
    if (!isStage(row.stage)) continue;
    const n = count(row.customers);
    if (!n) continue;
    const list = parts[row.stage];
    const part =
      list.find((p) => p.key === (row.detail ?? "none")) ?? list.find((p) => p.key === "none") ?? list[list.length - 1]!;
    part.customers += n;
    if (row.undated && (row.stage === "new" || row.stage === "loyal")) part.undated += n;
  }

  const total = LIFECYCLE_STAGES.reduce((sum, s) => sum + parts[s].reduce((t, p) => t + p.customers, 0), 0);
  return {
    total,
    stages: LIFECYCLE_STAGES.map((stage) => {
      const customers = parts[stage].reduce((t, p) => t + p.customers, 0);
      return {
        stage,
        label: LIFECYCLE_STAGE_LABEL[stage],
        rule: LIFECYCLE_STAGE_RULE[stage],
        customers,
        undated: parts[stage].reduce((t, p) => t + p.undated, 0),
        share: shareLabel(customers, total),
        parts: parts[stage],
      };
    }),
  };
}

/** A stage of the summary by name. */
export function lifecycleStageOf(summary: LifecycleSummary, stage: LifecycleStage): LifecycleStageSummary {
  return summary.stages.find((s) => s.stage === stage)!;
}
