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

export function terminalForResolution(resolution: RmaResolution): RmaStatus {
  return resolution === "refund" ? "refunded" : "completed";
}
