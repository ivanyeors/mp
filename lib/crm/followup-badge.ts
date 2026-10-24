/**
 * The Customers sidebar badge for follow-ups (CRM slice 06). Kept free of
 * imports: the sidebar is on every Admin Panel page, so anything it imports
 * ships with each of them. The rest of the rules are in `followup-rules.ts`.
 */

/** Fired after a follow-up changes, so the sidebar badge re-reads its counts. */
export const FOLLOW_UPS_CHANGED_EVENT = "mp:followups-changed";

/** The badge's counts for one profile. */
export type FollowUpCounts = { dueToday: number; overdue: number };

/** The sidebar badge: its number, or null to show nothing. */
export function followUpBadge(counts: FollowUpCounts | null): { total: number; title: string; urgent: boolean } | null {
  if (!counts) return null;
  const total = counts.dueToday + counts.overdue;
  if (total <= 0) return null;
  const parts = [
    counts.overdue > 0 ? `${counts.overdue} overdue` : null,
    counts.dueToday > 0 ? `${counts.dueToday} due today` : null,
  ].filter(Boolean);
  return { total, title: `Your follow-ups: ${parts.join(", ")}`, urgent: counts.overdue > 0 };
}
