import { z } from "zod";
import { addDays, sgtDate } from "@/lib/readjustment/eligibility";
import { formatAdminDateMY } from "@/lib/format/admin-date";

export const FOLLOW_UP_TITLE_MAX = 200;

export { FOLLOW_UPS_CHANGED_EVENT, followUpBadge, type FollowUpCounts } from "@/lib/crm/followup-badge";

export const FOLLOW_UP_SCOPES = ["mine", "all", "overdue"] as const;
export type FollowUpScope = (typeof FOLLOW_UP_SCOPES)[number];

export const FOLLOW_UP_SCOPE_LABELS: Record<FollowUpScope, string> = {
  mine: "Mine",
  all: "All",
  overdue: "Overdue",
};

export function parseFollowUpScope(value: string | null | undefined): FollowUpScope {
  return (FOLLOW_UP_SCOPES as readonly string[]).includes(value ?? "") ? (value as FollowUpScope) : "mine";
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const calendarDate = z
  .string()
  .regex(YMD, "Pick a due date.")
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Pick a due date.");

const profileId = z.string().regex(UUID, "Pick who it is for.");

export const FollowUpInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Say what to follow up.")
    .max(FOLLOW_UP_TITLE_MAX, `A follow-up is at most ${FOLLOW_UP_TITLE_MAX} characters.`),
  dueOn: calendarDate,
  assignedToProfileId: profileId,
});
export type FollowUpInput = z.infer<typeof FollowUpInputSchema>;

export const FollowUpPatchSchema = z.union([
  z.object({ done: z.literal(true) }).strict(),
  z.object({ assignedToProfileId: profileId }).strict(),
]);
export type FollowUpPatch = z.infer<typeof FollowUpPatchSchema>;

export type FollowUpProfile = { id: string; name: string };

export interface CustomerFollowUp {
  id: string;
  customerId: string;
  title: string;
  dueOn: string;
  assignee: FollowUpProfile & {
    archived: boolean;
  };
  createdBy: FollowUpProfile | null;
  createdAt: string;
  doneAt: string | null;
  doneBy: FollowUpProfile | null;
}

export interface FollowUpListRow extends CustomerFollowUp {
  customerName: string;
}

export interface CustomerFollowUpsData {
  rows: CustomerFollowUp[];
  today: string;
  me: FollowUpProfile | null;
  assignees: FollowUpProfile[];
}

export interface FollowUpListData {
  scope: FollowUpScope;
  rows: FollowUpListRow[];
  truncated: boolean;
  today: string;
  me: FollowUpProfile | null;
  assignees: FollowUpProfile[];
}

export function sgtToday(now: Date = new Date()): string {
  return sgtDate(now);
}

export function defaultDueOn(now: Date = new Date()): string {
  return addDays(sgtToday(now), 1);
}

export type FollowUpState = "done" | "overdue" | "due_today" | "upcoming";

export function followUpState(f: Pick<CustomerFollowUp, "doneAt" | "dueOn">, today: string): FollowUpState {
  if (f.doneAt) return "done";
  if (f.dueOn < today) return "overdue";
  if (f.dueOn === today) return "due_today";
  return "upcoming";
}

export function isOverdue(f: Pick<CustomerFollowUp, "doneAt" | "dueOn">, today: string): boolean {
  return followUpState(f, today) === "overdue";
}

export function isDue(f: Pick<CustomerFollowUp, "doneAt" | "dueOn">, today: string): boolean {
  const state = followUpState(f, today);
  return state === "overdue" || state === "due_today";
}

export function sortFollowUps<T extends Pick<CustomerFollowUp, "doneAt" | "dueOn" | "createdAt" | "id">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1;
    if (a.doneAt && b.doneAt) return a.doneAt < b.doneAt ? 1 : a.doneAt > b.doneAt ? -1 : 0;
    if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

export function formatDueOn(ymd: string): string {
  return formatAdminDateMY(`${ymd}T12:00:00+08:00`);
}

export function describeDue(f: Pick<CustomerFollowUp, "doneAt" | "dueOn">, today: string): string {
  switch (followUpState(f, today)) {
    case "done":
      return `Done ${formatAdminDateMY(f.doneAt)}`;
    case "overdue":
      return `Overdue · due ${formatDueOn(f.dueOn)}`;
    case "due_today":
      return "Due today";
    case "upcoming":
      return `Due ${formatDueOn(f.dueOn)}`;
  }
}
