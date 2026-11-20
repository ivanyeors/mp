export const MARKABLE_STATUSES = ["new", "pending", "backlog", "skipped"] as const;

export function canMarkReplied(row: { source: string; status: string }): boolean {
  return row.source === "places" && (MARKABLE_STATUSES as readonly string[]).includes(row.status);
}
