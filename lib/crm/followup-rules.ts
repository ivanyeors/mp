import { z } from "zod";
import { addDays, sgtDate } from "@/lib/readjustment/eligibility";
import { formatAdminDateMY } from "@/lib/format/admin-date";

/**
 * The parts of Follow-ups (lib/crm/followups.ts; CONTEXT.md **Follow-up**) the
 * Admin Panel's browser code shares with the routes: the input rules, the
 * shapes, and what *open*, *overdue* and *due* mean.
 *
 * A Follow-up is assigned to a **Staff profile**, never a Member or a login.
 * *Open* is `done_at` unset. *Overdue* is open with `due_on` before today in
 * Singapore; *due* (the sidebar badge) is open with `due_on` today or earlier.
 * "Today" is always the Singapore calendar day, wherever the code runs.
 */

export const FOLLOW_UP_TITLE_MAX = 200;

// The sidebar badge's event, counts and label live in `followup-badge.ts`,
// which imports nothing, so the sidebar on every Admin Panel page doesn't
// carry zod and these rules.
export { FOLLOW_UPS_CHANGED_EVENT, followUpBadge, type FollowUpCounts } from "@/lib/crm/followup-badge";

/** The Follow-ups tab's lists (`?view=followups&scope=`). */
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

/** A real calendar date, YYYY-MM-DD (rejects 2026-02-30). */
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

/** A change to one follow-up: mark it done, or give it to another profile. */
export const FollowUpPatchSchema = z.union([
  z.object({ done: z.literal(true) }).strict(),
  z.object({ assignedToProfileId: profileId }).strict(),
]);
export type FollowUpPatch = z.infer<typeof FollowUpPatchSchema>;

/** A Staff profile as a follow-up names it. */
export type FollowUpProfile = { id: string; name: string };

/** A follow-up as the Customer detail and the Follow-ups tab show it. */
export interface CustomerFollowUp {
  id: string;
  customerId: string;
  title: string;
  /** A Singapore calendar date, YYYY-MM-DD. */
  dueOn: string;
  assignee: FollowUpProfile & {
    /** Archived since it was assigned: the follow-up stays, waiting to be reassigned. */
    archived: boolean;
  };
  createdBy: FollowUpProfile | null;
  createdAt: string;
  doneAt: string | null;
  doneBy: FollowUpProfile | null;
}

/** A row of the Follow-ups tab: the follow-up and whose it is. */
export interface FollowUpListRow extends CustomerFollowUp {
  /** The Customer's name, else their email. */
  customerName: string;
}

/** What the Customer page's Journey reads (`GET /api/shop/customers/[id]/followups`). */
export interface CustomerFollowUpsData {
  rows: CustomerFollowUp[];
  /** The Singapore day the states are read against. */
  today: string;
  /** The profile the viewer works as: the form's default assignee. */
  me: FollowUpProfile | null;
  /** Who a follow-up may be given to; empty without `customers-edit`. */
  assignees: FollowUpProfile[];
}

/** What the Follow-ups tab reads (`GET /api/settings/customers/followups`). */
export interface FollowUpListData {
  scope: FollowUpScope;
  rows: FollowUpListRow[];
  /** More open follow-ups than one list shows. */
  truncated: boolean;
  today: string;
  /** Null on a shared login where nobody chose who they are working as: *Mine* is empty. */
  me: FollowUpProfile | null;
  assignees: FollowUpProfile[];
}

/** Today in Singapore, YYYY-MM-DD. */
export function sgtToday(now: Date = new Date()): string {
  return sgtDate(now);
}

/** The card's default due date: tomorrow in Singapore. */
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

/** Open, and due before today in Singapore. */
export function isOverdue(f: Pick<CustomerFollowUp, "doneAt" | "dueOn">, today: string): boolean {
  return followUpState(f, today) === "overdue";
}

/** Open, and due today or earlier: what the sidebar badge counts. */
export function isDue(f: Pick<CustomerFollowUp, "doneAt" | "dueOn">, today: string): boolean {
  const state = followUpState(f, today);
  return state === "overdue" || state === "due_today";
}

/**
 * Open first, by due date then when added; then the done ones, latest done
 * first. The Customer detail's order.
 */
export function sortFollowUps<T extends Pick<CustomerFollowUp, "doneAt" | "dueOn" | "createdAt" | "id">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (!a.doneAt !== !b.doneAt) return a.doneAt ? 1 : -1;
    if (a.doneAt && b.doneAt) return a.doneAt < b.doneAt ? 1 : a.doneAt > b.doneAt ? -1 : 0;
    if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/** `23 Oct 2026`: a due date read as the Singapore day it names. */
export function formatDueOn(ymd: string): string {
  return formatAdminDateMY(`${ymd}T12:00:00+08:00`);
}

/** *Due today*, *Overdue · 1 Oct 2026*, *Due 23 Oct 2026*, *Done 20 Oct 2026*. */
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
