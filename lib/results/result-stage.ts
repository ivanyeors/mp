/**
 * The one staff-facing stage of a customisation, spanning both sides of the
 * Result → Order handover.
 *
 * A Result row is terminal at `captured` (CONTEXT.md: the Order is the paid sale),
 * so the production/fulfilment half of the story lives on the Order. Rather than
 * forking that truth with production statuses on `mp_config_responses`, the stage
 * is DERIVED from the pair — the Results surface can then follow a customisation
 * from submission to handover without a second source of truth for delivery dates.
 *
 * Pure and dependency-free so it can be unit-tested over plain objects, and reused
 * by both the list and the detail page.
 */

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

/** Why a row is stuck. Each is a state that was previously unreachable by staff. */
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
  /**
   * The amount a card was authorized for at submit, or null when no hold was
   * ever taken. This — not `source` — is what says whether a card was EXPECTED,
   * which is the question the `held` branches below actually need to ask.
   *
   * Required, not optional, on purpose: omitting it would silently downgrade an
   * abandoned checkout to a normal queue item, so the compiler should catch a
   * caller that forgets rather than the staff noticing a missing Stuck badge.
   */
  authorized_amount: number | null;
  /** Linked order, when the Result has one. */
  order?: {
    status: string | null;
    delivered_at: string | null;
    needs_attention?: boolean | null;
  } | null;
}

export interface StageResult {
  stage: ResultStage;
  /** Set only when stage === "stuck". */
  stuckReason: StuckReason | null;
}

/**
 * Stripe authorization holds die at 7 days. `lib/sla-reminders` expires `held`
 * rows before that, but nothing watches `assigned` — so an assigned Result whose
 * customer never clicks Accept rots silently. Flag it a day early so staff can act
 * while the hold is still cancellable.
 */
const ASSIGNED_ROT_DAYS = 6;

const TERMINAL = new Set(["declined", "expired", "cancelled"]);

/**
 * Sources that mean "a customer submitted a customisation and is waiting on
 * Staff" — regardless of whether a card was taken. `manual` (in-store
 * measurement) is deliberately absent: that really is measurement-only.
 *
 * Both `held` branches below test this rather than spelling out
 * `source === "staff_assisted"`, so switching the authorization hold off for
 * online submits does not silently restage them as abandoned or as residue.
 */
const QUEUE_SOURCES = new Set(["online_purchase", "staff_assisted"]);

function ageInDays(iso: string | null, now: Date): number {
  if (!iso) return 0;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (now.getTime() - then) / 86_400_000;
}

/** Detect the states that need a human. Checked before the happy path. */
function stuckReason(input: StageInput, now: Date): StuckReason | null {
  const { status, source, payment_intent_id, order_id, order } = input;

  // An Order that could not deduct inventory (oversold) or whose ledger write
  // failed. Set at accept/webhook and surfaced in no UI before this.
  if (order?.needs_attention) return "needs_attention";

  // `mp-config-link` can attach an order_id to a Result that never went through
  // capture — a combination the lifecycle table has no concept of.
  if (order_id && status !== "captured") return "order_mismatch";

  // Accept claims the Result by moving it to `accepted` and stamps `order_id`
  // last. A request that died in between leaves it here: retry, cancel and
  // decline all refuse `accepted`, so only a human can settle it.
  // ponytail: a live accept also matches for its few seconds, which is harmless.
  if (status === "accepted" && !order_id) return "accept_interrupted";

  // Paid a top-up, never returned to finish accepting. Money taken, no Order.
  if (input.topup_paid_at && status === "assigned") return "topup_unsettled";

  if (status === "held" && !payment_intent_id) {
    // A card WAS expected — `authorized_amount` is stamped at submit whenever a
    // hold is taken — but none ever attached: the shopper abandoned Checkout.
    // The SLA cron skips PI-less rows, so it never expires on its own.
    // Keyed on the amount, not on `source`, so an online submit made with the
    // hold switched off is not mislabelled as abandoned.
    if (input.authorized_amount != null) return "abandoned_checkout";
    // No card was ever expected: an Assisted customisation, or an online submit
    // made while the hold is off. A queue item waiting on Staff, not residue —
    // the happy path below stages it as such.
    if (QUEUE_SOURCES.has(source ?? "")) return null;
    // In-store measurement-only Result. Legitimate, but it sits in `held` forever
    // and clutters the queue until someone closes it.
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
    // Past capture the Order drives the story. `delivered` (or a delivered_at on
    // an in-store handover) is the end of the line.
    const orderStatus = order?.status ?? null;
    if (orderStatus === "delivered" || order?.delivered_at) {
      return { stage: "handed_over", stuckReason: null };
    }
    if (orderStatus === "shipped") return { stage: "shipped", stuckReason: null };
    if (orderStatus === "processing") return { stage: "building", stuckReason: null };
    // cancelled/refunded orders are done with, not work in progress.
    if (orderStatus === "cancelled" || orderStatus === "refunded") {
      return { stage: "closed", stuckReason: null };
    }
    return { stage: "to_build", stuckReason: null };
  }

  if (status === "assigned") return { stage: "awaiting_customer", stuckReason: null };

  if (status === "held") {
    // A hold means a shopper is waiting on assignment. So does any customer
    // submission that reaches `held` with no card by design — Assisted, or made
    // while the hold is switched off — same work, same queue, so it must not
    // read as "measurement only".
    if (payment_intent_id || QUEUE_SOURCES.has(input.source ?? "")) {
      return { stage: "needs_assign", stuckReason: null };
    }
    return { stage: "measurement_only", stuckReason: null };
  }

  // Null status = an in-store draft that has not been finalized yet.
  return { stage: "measurement_only", stuckReason: null };
}

export const STAGE_LABELS: Record<ResultStage, string> = {
  // A Draft Result: started, and not yet sent, held or paid (PRD-results-to-customer slice 03).
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

/**
 * The queue buckets staff actually work from, in workflow order, then
 * *Unfinished*: the Draft Results, which are follow-ups for the CRM, not build
 * work (PRD-results-to-customer slice 03). *Needs assign* is the build team's
 * queue, as the sidebar badge counts it (`/api/results/queue-counts`).
 */
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

/** Which stages fall under each bucket tab. */
export function bucketFor(stage: ResultStage): StageBucket {
  if (stage === "building") return "to_build";
  if (stage === "handed_over") return "closed";
  if (stage === "measurement_only") return "unfinished";
  return stage;
}
