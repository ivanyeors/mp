import {
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABEL,
  LIFECYCLE_STAGE_RULE,
  type LifecycleDetail,
  type LifecycleStage,
} from "@/lib/crm/lifecycle-stage";
import { shareLabel } from "@/lib/format/share";

export interface LifecycleCountRow {
  stage: string | null;
  detail: string | null;
  undated: boolean | null;
  customers: number | string | null;
}

export type LifecyclePartKey = LifecycleDetail | "none";

export type LifecycleShade = 1 | 2 | 3;

interface PartDefinition {
  key: LifecyclePartKey;
  label: string;
  means: string;
  shade: LifecycleShade;
  undatedPart?: true;
}

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
  undated: number;
}

export interface LifecycleStageSummary {
  stage: LifecycleStage;
  label: string;
  rule: string;
  customers: number;
  undated: number;
  share: string;
  parts: LifecyclePart[];
}

export interface LifecycleSummary {
  total: number;
  stages: LifecycleStageSummary[];
}

const count = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const isStage = (v: unknown): v is LifecycleStage => LIFECYCLE_STAGES.includes(v as LifecycleStage);

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

export function lifecycleStageOf(summary: LifecycleSummary, stage: LifecycleStage): LifecycleStageSummary {
  return summary.stages.find((s) => s.stage === stage)!;
}
