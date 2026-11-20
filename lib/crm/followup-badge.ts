export const FOLLOW_UPS_CHANGED_EVENT = "mp:followups-changed";

export type FollowUpCounts = { dueToday: number; overdue: number };

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
