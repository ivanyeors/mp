/**
 * RMA lifecycle state machine (ADR 0011). Pure, no I/O — every server mutation
 * validates through `canTransition` before appending an `rma_status_events` row,
 * so an illegal transition is refused server-side, not merely hidden in the UI.
 */

export type RmaStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "cancelled"
  | "instructions_sent"
  | "received"
  | "completed"
  | "refunded";

export type RmaResolution = "refund" | "exchange" | "replacement";

export type RmaActor = "customer" | "staff" | "system";

/** Allowed forward transitions. Terminal states map to an empty list. */
const TRANSITIONS: Record<RmaStatus, RmaStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["instructions_sent", "cancelled"],
  instructions_sent: ["received", "cancelled"],
  received: ["completed", "refunded"],
  completed: [],
  refunded: [],
  rejected: [],
  cancelled: [],
};

export const RMA_TERMINAL_STATUSES: readonly RmaStatus[] = [
  "completed",
  "refunded",
  "rejected",
  "cancelled",
];

export function nextStatuses(from: RmaStatus): RmaStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: RmaStatus, to: RmaStatus): boolean {
  return nextStatuses(from).includes(to);
}

export function isTerminal(status: RmaStatus): boolean {
  return RMA_TERMINAL_STATUSES.includes(status);
}

/**
 * The terminal status a completed resolution drives: `refund` settles to
 * `refunded` (via the money-ledger webhook), exchange/replacement to `completed`.
 */
export function terminalForResolution(resolution: RmaResolution): RmaStatus {
  return resolution === "refund" ? "refunded" : "completed";
}
