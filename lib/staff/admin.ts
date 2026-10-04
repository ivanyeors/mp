import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { escapeLikePattern } from "@/lib/auth/customer-identity";

/**
 * Staff profiles (`mp_staff`, ADR 0023): the named people who work under a
 * Member (login). A Result is "measured by" a profile; a Telegram link
 * belongs to one. Profiles are archived, never deleted, so attribution on
 * old Results survives. Every write is audited as `staff_profile.*`.
 */

export type StaffProfile = {
  id: string;
  name: string;
  memberId: string;
  memberEmail: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbProfile = {
  id: string;
  name: string;
  admin_user_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  member?: { email: string } | { email: string }[] | null;
};

const PROFILE_COLUMNS = "id, name, admin_user_id, archived_at, created_at, updated_at, member:admin_users!admin_user_id(email)";

function toProfile(row: DbProfile): StaffProfile {
  const member = Array.isArray(row.member) ? row.member[0] : row.member;
  return {
    id: row.id,
    name: row.name,
    memberId: row.admin_user_id,
    memberEmail: member?.email ?? null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Staff profiles with the email of the login each works under, by name.
 * Archived profiles are left out unless asked for (Results still needs them
 * to label old rows). Throws on a Supabase error.
 */
export async function listStaffProfiles({ includeArchived = false } = {}): Promise<StaffProfile[]> {
  let query = supabaseAdmin().from("mp_staff").select(PROFILE_COLUMNS);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbProfile[]).map(toProfile);
}

export type ProfileWriteResult =
  | { ok: true; profile: StaffProfile }
  | { ok: false; status: 400 | 404 | 409; error: string };

const clash = (name: string): ProfileWriteResult => ({
  ok: false,
  status: 409,
  error: `This login already has a profile named ${name}.`,
});

const isUnique = (message: string) => /duplicate key|unique/i.test(message);

async function loadProfile(id: string): Promise<StaffProfile | null> {
  const { data, error } = await supabaseAdmin().from("mp_staff").select(PROFILE_COLUMNS).eq("id", id).maybeSingle<DbProfile>();
  if (error) throw new Error(error.message);
  return data ? toProfile(data) : null;
}

/** An active profile under `memberId` already has this name (the unique index is the backstop). */
async function nameTaken(memberId: string, name: string, exceptId?: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from("mp_staff")
    .select("id")
    .eq("admin_user_id", memberId)
    .is("archived_at", null)
    .ilike("name", escapeLikePattern(name));
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).some((r) => r.id !== exceptId);
}

async function memberExists(memberId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("admin_users").select("id").eq("id", memberId).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data;
}

const snapshot = (p: StaffProfile) => ({
  name: p.name,
  member: p.memberEmail,
  archived: p.archivedAt != null,
});

/** The default first profile name for a login: its email's local part, title-cased. */
export function defaultProfileName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase())
      .join(" ") || email
  );
}

/**
 * Create a profile under a Member. `actor` null is a system write (first
 * profile for a bootstrap Owner), still audited.
 */
export async function createStaffProfile(
  actor: AdminContext | null,
  memberId: string,
  name: string,
): Promise<ProfileWriteResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, status: 400, error: "Name is required." };
  if (!(await memberExists(memberId))) return { ok: false, status: 404, error: "That login no longer exists." };
  if (await nameTaken(memberId, trimmed)) return clash(trimmed);

  const { data, error } = await supabaseAdmin()
    .from("mp_staff")
    .insert({ name: trimmed, admin_user_id: memberId })
    .select(PROFILE_COLUMNS)
    .single<DbProfile>();
  if (error) {
    if (isUnique(error.message)) return clash(trimmed);
    throw new Error(error.message);
  }
  const profile = toProfile(data);
  await recordAdminAction({
    actor,
    action: "staff_profile.create",
    entityType: "staff_profile",
    entityId: profile.id,
    after: snapshot(profile),
  });
  return { ok: true, profile };
}

type ProfileChange =
  | { kind: "rename"; name: string }
  | { kind: "move"; memberId: string }
  | { kind: "archive" }
  | { kind: "restore" };

/** Rename, move to another login, archive or restore a profile. */
export async function updateStaffProfile(
  actor: AdminContext,
  id: string,
  change: ProfileChange,
): Promise<ProfileWriteResult> {
  const before = await loadProfile(id);
  if (!before) return { ok: false, status: 404, error: "Profile not found." };

  let patch: Record<string, unknown>;
  switch (change.kind) {
    case "rename": {
      const name = change.name.trim();
      if (!name) return { ok: false, status: 400, error: "Name is required." };
      if (await nameTaken(before.memberId, name, id)) return clash(name);
      patch = { name };
      break;
    }
    case "move":
      if (!(await memberExists(change.memberId))) return { ok: false, status: 404, error: "That login no longer exists." };
      if (!before.archivedAt && (await nameTaken(change.memberId, before.name, id))) {
        return { ok: false, status: 409, error: `That login already has a profile named ${before.name}.` };
      }
      patch = { admin_user_id: change.memberId };
      break;
    case "archive":
      patch = { archived_at: before.archivedAt ?? new Date().toISOString() };
      break;
    case "restore":
      if (before.archivedAt && (await nameTaken(before.memberId, before.name, id))) return clash(before.name);
      patch = { archived_at: null };
      break;
  }

  const { data, error } = await supabaseAdmin()
    .from("mp_staff")
    .update(patch)
    .eq("id", id)
    .select(PROFILE_COLUMNS)
    .single<DbProfile>();
  if (error) {
    if (isUnique(error.message)) return clash(change.kind === "rename" ? change.name.trim() : before.name);
    throw new Error(error.message);
  }
  const after = toProfile(data);
  await recordAdminAction({
    actor,
    action: `staff_profile.${change.kind}`,
    entityType: "staff_profile",
    entityId: id,
    before: snapshot(before),
    after: snapshot(after),
  });
  return { ok: true, profile: after };
}

/**
 * Whether a profile may be newly picked as a Result's "measured by": it
 * exists and is not archived. Rows that already name an archived profile
 * keep it; only a change to it is checked.
 */
export async function isPickableStaffProfile(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("mp_staff").select("id, archived_at").eq("id", id).maybeSingle();
  if (error || !data) return false;
  return data.archived_at == null;
}
