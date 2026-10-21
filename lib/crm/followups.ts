import { supabaseAdmin } from "@/lib/supabase/server";
import { permissionsForRoleRow, type RoleGrant } from "@/lib/auth/permissions";
import {
  sortFollowUps,
  type CustomerFollowUp,
  type FollowUpCounts,
  type FollowUpInput,
  type FollowUpListRow,
  type FollowUpProfile,
  type FollowUpScope,
} from "@/lib/crm/followup-rules";

/**
 * Follow-ups (CONTEXT.md; ADR 0028 (e)): a dated to-do about one Customer,
 * assigned to a **Staff profile**, in `customer_followups`. Only the service
 * role can read the table, so every read and write goes through here from an
 * Admin Panel route that has already checked the caller: `customers` to see
 * them (every follow-up, everyone's), `customers-edit` to change them.
 *
 * Who created or completed one is the profile the person works as
 * (`actingProfile`), which is attribution only.
 */

/** At most this many rows in one Follow-ups tab list. */
export const FOLLOW_UP_LIST_LIMIT = 200;

type ProfileRef = { id: string; name: string; archived_at?: string | null };
type Embedded<T> = T | T[] | null;

type FollowUpRow = {
  id: string;
  customer_id: string;
  title: string;
  due_on: string;
  assigned_to_profile_id: string;
  created_at: string;
  done_at: string | null;
  assignee: Embedded<ProfileRef>;
  creator: Embedded<ProfileRef>;
  finisher: Embedded<ProfileRef>;
  customer?: Embedded<{ first_name: string | null; last_name: string | null; email: string | null }>;
};

const one = <T>(v: Embedded<T> | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Each profile column has its own embed: three foreign keys to `mp_staff`. */
const FOLLOW_UP_COLUMNS =
  "id, customer_id, title, due_on, assigned_to_profile_id, created_at, done_at, " +
  "assignee:mp_staff!assigned_to_profile_id(id, name, archived_at), " +
  "creator:mp_staff!created_by_profile_id(id, name), " +
  "finisher:mp_staff!done_by_profile_id(id, name)";

const LIST_COLUMNS = `${FOLLOW_UP_COLUMNS}, customer:customers!customer_id(first_name, last_name, email)`;

const profileOf = (p: ProfileRef | null): FollowUpProfile | null => (p ? { id: p.id, name: p.name } : null);

function toFollowUp(row: FollowUpRow): CustomerFollowUp {
  const assignee = one(row.assignee);
  return {
    id: row.id,
    customerId: row.customer_id,
    title: row.title,
    dueOn: row.due_on,
    assignee: {
      id: row.assigned_to_profile_id,
      name: assignee?.name ?? "Staff",
      archived: Boolean(assignee?.archived_at),
    },
    createdBy: profileOf(one(row.creator)),
    createdAt: row.created_at,
    doneAt: row.done_at,
    doneBy: profileOf(one(row.finisher)),
  };
}

function toListRow(row: FollowUpRow): FollowUpListRow {
  const c = one(row.customer);
  const name = [c?.first_name, c?.last_name].filter(Boolean).join(" ");
  return { ...toFollowUp(row), customerName: name || c?.email || "Customer" };
}

/** A Customer's follow-ups: open first by due date, then the done ones. */
export async function listCustomerFollowUps(customerId: string): Promise<CustomerFollowUp[]> {
  const { data, error } = await supabaseAdmin()
    .from("customer_followups")
    .select(FOLLOW_UP_COLUMNS)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return sortFollowUps(((data ?? []) as unknown as FollowUpRow[]).map(toFollowUp));
}

/**
 * A Customer's follow-ups added or done at or before `before`, newest first:
 * the Customer timeline's bounded read, one stream per dated column.
 */
export async function listFollowUpsByTime(
  customerId: string,
  column: "created_at" | "done_at",
  before: string | null,
  limit: number,
): Promise<CustomerFollowUp[]> {
  let query = supabaseAdmin()
    .from("customer_followups")
    .select(FOLLOW_UP_COLUMNS)
    .eq("customer_id", customerId)
    .not(column, "is", null);
  if (before) query = query.lte(column, before);
  const { data, error } = await query.order(column, { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as FollowUpRow[]).map(toFollowUp);
}

/**
 * One list of the Follow-ups tab, open follow-ups only, by due date:
 *
 * - `mine`: assigned to `profileId` (none without a profile);
 * - `all`: everyone's, archived assignees included, so none is ever dropped;
 * - `overdue`: everyone's that were due before `today` (Singapore).
 */
export async function listFollowUps(input: {
  scope: FollowUpScope;
  profileId: string | null;
  today: string;
}): Promise<{ rows: FollowUpListRow[]; truncated: boolean }> {
  if (input.scope === "mine" && !input.profileId) return { rows: [], truncated: false };
  let query = supabaseAdmin().from("customer_followups").select(LIST_COLUMNS).is("done_at", null);
  if (input.scope === "mine") query = query.eq("assigned_to_profile_id", input.profileId!);
  if (input.scope === "overdue") query = query.lt("due_on", input.today);
  const { data, error } = await query.order("due_on", { ascending: true }).limit(FOLLOW_UP_LIST_LIMIT + 1);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as unknown as FollowUpRow[]).map(toListRow);
  return { rows: sortFollowUps(rows).slice(0, FOLLOW_UP_LIST_LIMIT), truncated: rows.length > FOLLOW_UP_LIST_LIMIT };
}

/** The sidebar badge for one profile: its open follow-ups due today, and overdue. */
export async function countDueFollowUps(profileId: string, today: string): Promise<FollowUpCounts> {
  const open = () =>
    supabaseAdmin()
      .from("customer_followups")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to_profile_id", profileId)
      .is("done_at", null);
  const [dueToday, overdue] = await Promise.all([open().eq("due_on", today), open().lt("due_on", today)]);
  if (dueToday.error) throw new Error(dueToday.error.message);
  if (overdue.error) throw new Error(overdue.error.message);
  return { dueToday: dueToday.count ?? 0, overdue: overdue.count ?? 0 };
}

type MemberRow = { id: string; is_active: boolean; role: Embedded<RoleGrant> };

/**
 * Who a follow-up may be given to: live Staff profiles whose **Member** is
 * active and holds `customers-edit`, so nobody is assigned one they cannot
 * close. By name. Archived profiles and view-only logins are left out.
 */
export async function listAssignableProfiles(): Promise<FollowUpProfile[]> {
  const admin = supabaseAdmin();
  const { data: profiles, error } = await admin
    .from("mp_staff")
    .select("id, name, admin_user_id")
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (profiles ?? []) as { id: string; name: string; admin_user_id: string }[];
  const memberIds = [...new Set(rows.map((p) => p.admin_user_id))];
  if (!memberIds.length) return [];

  const { data: members, error: membersError } = await admin
    .from("admin_users")
    .select("id, is_active, role:admin_roles(grants_all, permissions)")
    .in("id", memberIds);
  if (membersError) throw new Error(membersError.message);
  const canClose = new Set(
    ((members ?? []) as unknown as MemberRow[])
      .filter((m) => {
        const role = one(m.role);
        return m.is_active && role !== null && permissionsForRoleRow(role).has("customers-edit");
      })
      .map((m) => m.id),
  );
  return rows.filter((p) => canClose.has(p.admin_user_id)).map((p) => ({ id: p.id, name: p.name }));
}

/** Adds a follow-up. The caller has checked the Customer exists and the assignee may close it. */
export async function createFollowUp(
  customerId: string,
  input: FollowUpInput,
  createdByProfileId: string | null,
): Promise<CustomerFollowUp> {
  const { data, error } = await supabaseAdmin()
    .from("customer_followups")
    .insert({
      customer_id: customerId,
      title: input.title,
      due_on: input.dueOn,
      assigned_to_profile_id: input.assignedToProfileId,
      created_by_profile_id: createdByProfileId,
    })
    .select(FOLLOW_UP_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not save the follow-up");
  return toFollowUp(data as unknown as FollowUpRow);
}

/** One of a Customer's follow-ups, or null. */
export async function getFollowUp(customerId: string, followUpId: string): Promise<CustomerFollowUp | null> {
  const { data, error } = await supabaseAdmin()
    .from("customer_followups")
    .select(FOLLOW_UP_COLUMNS)
    .eq("id", followUpId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toFollowUp(data as unknown as FollowUpRow) : null;
}

/**
 * Marks an open follow-up done by `byProfileId`. Returns it, or null when it
 * was done already (or is gone), so two clicks record one completion.
 */
export async function completeFollowUp(
  followUpId: string,
  byProfileId: string | null,
): Promise<CustomerFollowUp | null> {
  const { data, error } = await supabaseAdmin()
    .from("customer_followups")
    .update({ done_at: new Date().toISOString(), done_by_profile_id: byProfileId })
    .eq("id", followUpId)
    .is("done_at", null)
    .select(FOLLOW_UP_COLUMNS);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as unknown as FollowUpRow | undefined;
  return row ? toFollowUp(row) : null;
}

/** Gives an open follow-up to another profile. Null when it is done or gone. */
export async function reassignFollowUp(followUpId: string, profileId: string): Promise<CustomerFollowUp | null> {
  const { data, error } = await supabaseAdmin()
    .from("customer_followups")
    .update({ assigned_to_profile_id: profileId })
    .eq("id", followUpId)
    .is("done_at", null)
    .select(FOLLOW_UP_COLUMNS);
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as unknown as FollowUpRow | undefined;
  return row ? toFollowUp(row) : null;
}

/** Deletes a follow-up. False when it was not there. */
export async function deleteFollowUp(customerId: string, followUpId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("customer_followups")
    .delete()
    .eq("id", followUpId)
    .eq("customer_id", customerId)
    .select("id");
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}
