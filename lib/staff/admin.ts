import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import { loginRefusal } from "@/lib/auth/login-guard";
import { isPermission, permissionEntry } from "@/lib/auth/permissions";

export { defaultProfileName } from "@/lib/staff/profile-name";

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

export async function listStaffProfiles({ includeArchived = false } = {}): Promise<StaffProfile[]> {
  let query = supabaseAdmin().from("mp_staff").select(PROFILE_COLUMNS);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query.order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbProfile[]).map(toProfile);
}

export function withoutLoginEmails(profiles: StaffProfile[]): StaffProfile[] {
  return profiles.map((p) => ({ ...p, memberEmail: null }));
}

export type ProfileWriteResult =
  | { ok: true; profile: StaffProfile }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

const clash = (name: string): ProfileWriteResult => ({
  ok: false,
  status: 409,
  error: `This login already has a profile named ${name}.`,
});

const isUnique = (message: string) => /duplicate key|unique/i.test(message);

async function loadProfile(id: string): Promise<StaffProfile | null> {
  const { data, error } = await supabaseAdmin().from("mp_staff").select(PROFILE_COLUMNS).eq("id", id).maybeSingle<DbProfile>();
  if (error && error.code !== "22P02") throw new Error(error.message);
  return data ? toProfile(data) : null;
}

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

export async function createStaffProfile(
  actor: AdminContext | null,
  memberId: string,
  name: string,
): Promise<ProfileWriteResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, status: 400, error: "Name is required." };
  if (!(await memberExists(memberId))) return { ok: false, status: 404, error: "That login no longer exists." };
  if (actor) {
    const refusal = await loginRefusal(actor, memberId);
    if (refusal) return refusal;
  }
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

export async function updateStaffProfile(
  actor: AdminContext,
  id: string,
  change: ProfileChange,
): Promise<ProfileWriteResult> {
  const before = await loadProfile(id);
  if (!before) return { ok: false, status: 404, error: "Profile not found." };
  const here = await loginRefusal(actor, before.memberId);
  if (here) return here;

  let patch: Record<string, unknown>;
  switch (change.kind) {
    case "rename": {
      const name = change.name.trim();
      if (!name) return { ok: false, status: 400, error: "Name is required." };
      if (await nameTaken(before.memberId, name, id)) return clash(name);
      patch = { name };
      break;
    }
    case "move": {
      if (!(await memberExists(change.memberId))) return { ok: false, status: 404, error: "That login no longer exists." };
      const there = await loginRefusal(actor, change.memberId);
      if (there) return there;
      const beyond = await linkActionsBeyond(actor, id);
      if (beyond.length) {
        return {
          ok: false,
          status: 403,
          error: `${before.name}'s Telegram link can ${beyond.join(", ")}, which your role doesn't have. Ask an Owner or Admin to move it.`,
        };
      }
      if (!before.archivedAt && (await nameTaken(change.memberId, before.name, id))) {
        return { ok: false, status: 409, error: `That login already has a profile named ${before.name}.` };
      }
      patch = { admin_user_id: change.memberId };
      break;
    }
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
  const telegramUnlinked = change.kind === "move" && (await unbindTelegram(id));
  await recordAdminAction({
    actor,
    action: `staff_profile.${change.kind}`,
    entityType: "staff_profile",
    entityId: id,
    before: snapshot(before),
    after: { ...snapshot(after), ...(telegramUnlinked ? { telegramUnlinked: true } : {}) },
  });
  return { ok: true, profile: after };
}

async function unbindTelegram(profileId: string): Promise<boolean> {
  const admin = supabaseAdmin();
  const { data: link, error: readError } = await admin
    .from("telegram_operators")
    .select("id, telegram_user_id, link_code_hash")
    .eq("staff_profile_id", profileId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!link || (link.telegram_user_id == null && link.link_code_hash == null)) return false;
  const { error } = await admin
    .from("telegram_operators")
    .update({
      telegram_user_id: null,
      telegram_username: null,
      linked_at: null,
      link_code_hash: null,
      link_code_expires_at: null,
    })
    .eq("id", link.id);
  if (error) throw new Error(error.message);
  return true;
}

async function linkActionsBeyond(actor: AdminContext, profileId: string): Promise<string[]> {
  if (actor.grantsAll) return [];
  const { data, error } = await supabaseAdmin()
    .from("telegram_operators")
    .select("actions")
    .eq("staff_profile_id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const actions = ((data?.actions as string[] | undefined) ?? []).filter(isPermission);
  return actions.filter((a) => !actor.permissions.has(a)).map((a) => permissionEntry(a).label);
}

export async function isPickableStaffProfile(id: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin().from("mp_staff").select("id, archived_at").eq("id", id).maybeSingle();
  if (error || !data) return false;
  return data.archived_at == null;
}
