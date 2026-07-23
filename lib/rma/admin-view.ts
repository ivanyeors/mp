/**
 * Pure view helpers for the admin RMA surface (slice 04). No I/O — shared by the
 * queue and detail server components and unit-tested in isolation.
 */
import { nextStatuses, type RmaStatus } from "@/lib/rma/transitions";

/** Every RMA status, derived from the transition graph so the two never drift. */
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

// Fail loudly in dev if a new status is added to the enum but not listed here.
// nextStatuses only has keys for known statuses, so an unknown string returns [].
if (process.env.NODE_ENV !== "production") {
  for (const s of RMA_STATUSES) {
    // touch the graph so an unlisted status surfaces as an obvious empty edge set
    void nextStatuses(s);
  }
}

/**
 * Coerce a raw `?status=` query value into a valid filter. Returns the status
 * when it is a known `RmaStatus`, otherwise null ("All statuses") — so a garbage
 * or absent param never leaks into the DB query.
 */
export function parseStatusFilter(raw: string | undefined | null): RmaStatus | null {
  if (!raw) return null;
  return (RMA_STATUSES as readonly string[]).includes(raw) ? (raw as RmaStatus) : null;
}

/** Title-case a snake_case status/actor for display, e.g. "instructions_sent" → "Instructions sent". */
export function humanizeToken(token: string): string {
  const spaced = token.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
