/**
 * When a Google review can be marked replied by hand
 * (PRD-customer-page-journey slice 03). Pure and import-free, so the read that
 * builds the Reviews tab and the action that writes share one rule.
 */

/** Statuses in which no reply is on record. */
export const MARKABLE_STATUSES = ["new", "pending", "backlog", "skipped"] as const;

/**
 * *Mark replied* applies to a review read through the Places API, which cannot
 * show us replies, while none is on record. A Business Profile review is never
 * marked: the sync reads its reply from Google.
 */
export function canMarkReplied(row: { source: string; status: string }): boolean {
  return row.source === "places" && (MARKABLE_STATUSES as readonly string[]).includes(row.status);
}
