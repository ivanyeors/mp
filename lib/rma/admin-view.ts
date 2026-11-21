import { nextStatuses, type RmaStatus } from "@/lib/rma/transitions";

export const RMA_STATUSES: readonly RmaStatus[] = [
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "instructions_sent",
  "received",
  "completed",
  "refunded",
];

if (process.env.NODE_ENV !== "production") {
  for (const s of RMA_STATUSES) {
    void nextStatuses(s);
  }
}

export function parseStatusFilter(raw: string | undefined | null): RmaStatus | null {
  if (!raw) return null;
  return (RMA_STATUSES as readonly string[]).includes(raw) ? (raw as RmaStatus) : null;
}

export function humanizeToken(token: string): string {
  const spaced = token.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
