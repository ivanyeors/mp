export type ResultStage =
  | "measurement_only"
  | "needs_assign"
  | "awaiting_customer"
  | "to_build"
  | "building"
  | "shipped"
  | "handed_over"
  | "closed"
  | "stuck";

export type StuckReason =
  | "abandoned_checkout"
  | "measurement_residue"
  | "hold_rotting"
  | "topup_unsettled"
  | "order_mismatch"
  | "needs_attention"
  | "accept_interrupted";

export interface StageInput {
  status: string | null;
  source: string | null;
  payment_intent_id: string | null;
  created_at: string | null;
  order_id: string | null;
  topup_paid_at?: string | null;
  authorized_amount: number | null;
  order?: {
    status: string | null;
    delivered_at: string | null;
    needs_attention?: boolean | null;
  } | null;
}

export interface StageResult {
  stage: ResultStage;
  stuckReason: StuckReason | null;
}

const ASSIGNED_ROT_DAYS = 6;

const TERMINAL = new Set(["declined", "expired", "cancelled"]);

const QUEUE_SOURCES = new Set(["online_purchase", "staff_assisted"]);

function ageInDays(iso: string | null, now: Date): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (now.getTime() - then) / 86_400_000;
}

function stuckReason(input: StageInput, now: Date): StuckReason | null {
  const { status, source, payment_intent_id, order_id, order } = input;

  if (order?.needs_attention) return "needs_attention";

  if (order_id && status !== "captured") return "order_mismatch";

  // ponytail: a live accept also matches for its few seconds, which is harmless.
  if (status === "accepted" && !order_id) return "accept_interrupted";

  if (input.topup_paid_at && status === "assigned") return "topup_unsettled";

  if (status === "held" && !payment_intent_id) {
    if (input.authorized_amount != null) return "abandoned_checkout";
    if (QUEUE_SOURCES.has(source ?? "")) return null;
    return "measurement_residue";
  }

  if (status === "assigned" && payment_intent_id) {
    if (ageInDays(input.created_at, now) >= ASSIGNED_ROT_DAYS) return "hold_rotting";
  }

  return null;
}

export function resultStage(input: StageInput, now: Date = new Date()): StageResult {
  const reason = stuckReason(input, now);
  if (reason) return { stage: "stuck", stuckReason: reason };

  const { status, payment_intent_id, order } = input;

  if (status && TERMINAL.has(status)) return { stage: "closed", stuckReason: null };

  if (status === "captured") {
    const orderStatus = order?.status ?? null;
    if (orderStatus === "delivered" || order?.delivered_at) {
      return { stage: "handed_over", stuckReason: null };
    }
    if (orderStatus === "shipped") return { stage: "shipped", stuckReason: null };
    if (orderStatus === "processing") return { stage: "building", stuckReason: null };
    if (orderStatus === "cancelled" || orderStatus === "refunded") {
      return { stage: "closed", stuckReason: null };
    }
    return { stage: "to_build", stuckReason: null };
  }

  if (status === "assigned") return { stage: "awaiting_customer", stuckReason: null };

  if (status === "held") {
    if (payment_intent_id || QUEUE_SOURCES.has(input.source ?? "")) {
      return { stage: "needs_assign", stuckReason: null };
    }
    return { stage: "measurement_only", stuckReason: null };
  }

  return { stage: "measurement_only", stuckReason: null };
}

export const STAGE_LABELS: Record<ResultStage, string> = {
  measurement_only: "Unfinished",
  needs_assign: "Needs assign",
  awaiting_customer: "Awaiting customer",
  to_build: "To build",
  building: "Building",
  shipped: "Shipped",
  handed_over: "Handed over",
  closed: "Closed",
  stuck: "Stuck",
};

export const STUCK_REASON_LABELS: Record<StuckReason, string> = {
  abandoned_checkout: "Checkout abandoned — no hold attached",
  measurement_residue: "Measurement only — never purchased",
  hold_rotting: "Hold expiring — customer has not accepted",
  topup_unsettled: "Top-up paid — not settled into an Order",
  order_mismatch: "Linked to an Order without capture",
  needs_attention: "Order needs attention",
  accept_interrupted: "Accept interrupted — check Stripe and Orders",
};

export const STAGE_BUCKETS = [
  "needs_assign",
  "awaiting_customer",
  "to_build",
  "shipped",
  "stuck",
  "unfinished",
  "closed",
] as const;

export type StageBucket = (typeof STAGE_BUCKETS)[number];

export function bucketFor(stage: ResultStage): StageBucket {
  if (stage === "building") return "to_build";
  if (stage === "handed_over") return "closed";
  if (stage === "measurement_only") return "unfinished";
  return stage;
}
