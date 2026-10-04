/**
 * Members and Roles reads/writes for Users & permissions (ADR 0023).
 *
 * A Member is one `admin_users` row: Invited until its auth user is bound on
 * first sign-in, then Active or Deactivated. Writes go through the pure rules
 * in `role-policy.ts` and are written to the Audit Log with before/after.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import { getEmailTransport } from "@/lib/email";
import { renderAdminInviteEmail } from "@/lib/email/auth";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getSiteOrigin } from "@/lib/site-url";
import { createStaffProfile, defaultProfileName } from "@/lib/staff/admin";
import {
  canAssignRole,
  canUpdateMember,
  type Decision,
  type MemberChange,
  type PolicyRole,
} from "@/lib/auth/role-policy";

export type MemberStatus = "invited" | "active" | "deactivated";

export type MemberRow = {
  id: string;
  email: string;
  roleId: string;
  status: MemberStatus;
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
  /** When the invite email last went out (Invited Members). */
  inviteSentAt: string | null;
};

export type RoleRow = Omit<PolicyRole, "permissions"> & {
  permissions: string[];
  description: string | null;
  memberCount: number;
};

type DbMember = {
  id: string;
  email: string;
  role_id: string;
  is_active: boolean;
  auth_user_id: string | null;
  created_at: string;
  invite_sent_at?: string | null;
};

const MEMBER_COLUMNS = "id, email, role_id, is_active, auth_user_id, created_at, invite_sent_at";
const ROLE_COLUMNS = "id, key, name, description, is_system, grants_all, permissions";

export function memberStatus(row: { is_active: boolean; auth_user_id: string | null }): MemberStatus {
  if (!row.is_active) return "deactivated";
  return row.auth_user_id ? "active" : "invited";
}

function toMember(row: DbMember, lastSignIn: Map<string, string | null>): MemberRow {
  return {
    id: row.id,
    email: row.email,
    roleId: row.role_id,
    status: memberStatus(row),
    isActive: row.is_active,
    createdAt: row.created_at,
    lastSignInAt: row.auth_user_id ? (lastSignIn.get(row.auth_user_id) ?? null) : null,
    inviteSentAt: row.invite_sent_at ?? null,
  };
}

/** auth user id → last sign-in. Best-effort: an Auth API failure shows "—", never blocks the page. */
async function lastSignIns(): Promise<Map<string, string | null>> {
  try {
    const { data } = await supabaseAdmin().auth.admin.listUsers({ page: 1, perPage: 1000 });
    return new Map((data?.users ?? []).map((u) => [u.id, u.last_sign_in_at ?? null]));
  } catch {
    return new Map();
  }
}

/** Every Member, oldest first. Throws on a read error. */
export async function listMembers(): Promise<MemberRow[]> {
  const [{ data, error }, signIns] = await Promise.all([
    supabaseAdmin().from("admin_users").select(MEMBER_COLUMNS).order("created_at", { ascending: true }),
    lastSignIns(),
  ]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as DbMember[]).map((row) => toMember(row, signIns));
}

/** Every role, built-in first then by name, with how many Members hold it. Throws on a read error. */
export async function listRoles(): Promise<RoleRow[]> {
  const admin = supabaseAdmin();
  const [roles, members] = await Promise.all([
    admin.from("admin_roles").select(ROLE_COLUMNS),
    admin.from("admin_users").select("role_id"),
  ]);
  const error = roles.error ?? members.error;
  if (error) throw new Error(error.message);
  const counts = new Map<string, number>();
  for (const m of (members.data ?? []) as { role_id: string }[]) counts.set(m.role_id, (counts.get(m.role_id) ?? 0) + 1);
  const order = (r: PolicyRole) => (r.key === "owner" ? 0 : r.key === "admin" ? 1 : 2);
  return ((roles.data ?? []) as Omit<RoleRow, "memberCount">[])
    .map((r) => ({ ...r, permissions: r.permissions ?? [], memberCount: counts.get(r.id) ?? 0 }))
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

async function countActiveOwners(ownerRoleId: string | undefined): Promise<number> {
  if (!ownerRoleId) return 0;
  const { count } = await supabaseAdmin()
    .from("admin_users")
    .select("id", { count: "exact", head: true })
    .eq("role_id", ownerRoleId)
    .eq("is_active", true);
  return count ?? 0;
}

export type UpdateMemberResult = { ok: true; member: MemberRow } | Exclude<Decision, { ok: true }>;

/**
 * Change a Member's role and/or active state, enforcing the role policy
 * against the current rows. Audited as `member.update`.
 */
export async function updateMember(
  actor: AdminContext,
  id: string,
  change: MemberChange,
): Promise<UpdateMemberResult> {
  const admin = supabaseAdmin();
  const { data: target, error: findError } = await admin
    .from("admin_users")
    .select(MEMBER_COLUMNS)
    .eq("id", id)
    .maybeSingle<DbMember>();
  if (findError) throw new Error(findError.message);
  if (!target) return { ok: false, status: 404, error: "Member not found." };

  const roles = await listRoles();
  const byId = new Map<string, PolicyRole>(roles.map((r) => [r.id, r]));
  const owners = await countActiveOwners(roles.find((r) => r.key === "owner")?.id);
  const decision = canUpdateMember(
    actor,
    { id: target.id, roleId: target.role_id, isActive: target.is_active },
    change,
    byId,
    owners,
  );
  if (!decision.ok) return decision;

  const roleName = (roleId: string) => byId.get(roleId)?.name ?? roleId;
  const before = { email: target.email, role: roleName(target.role_id), status: memberStatus(target) };

  const patch: Record<string, unknown> = {};
  if (change.roleId !== undefined) patch.role_id = change.roleId;
  if (change.isActive !== undefined) patch.is_active = change.isActive;

  const { data: updated, error } = await admin
    .from("admin_users")
    .update(patch)
    .eq("id", id)
    .select(MEMBER_COLUMNS)
    .single<DbMember>();
  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "member.update",
    entityType: "member",
    entityId: id,
    before,
    after: { email: updated.email, role: roleName(updated.role_id), status: memberStatus(updated) },
  });

  const signIns = await lastSignIns();
  return { ok: true, member: toMember(updated, signIns) };
}

// ---------------------------------------------------------------------------
// Invites (slice 05)
// ---------------------------------------------------------------------------

/** Resend is refused within this long of the last send. */
export const RESEND_COOLDOWN_MS = 60_000;

const STATUS_LABEL: Record<MemberStatus, string> = { invited: "Invited", active: "Active", deactivated: "Deactivated" };

type Refusal = Exclude<Decision, { ok: true }> | { ok: false; status: 429; error: string };

function signInUrl(): string {
  const next = withLocale("/settings", DEFAULT_LOCALE);
  return `${getSiteOrigin()}${withLocale("/account/login", DEFAULT_LOCALE)}?next=${encodeURIComponent(next)}`;
}

/** Send (or re-send) the invite email; true when the transport accepted it. */
async function sendInviteEmail(actor: AdminContext, email: string, roleName: string): Promise<boolean> {
  try {
    await getEmailTransport().send({
      to: email,
      from: getDefaultFromAddress(),
      ...renderAdminInviteEmail({ inviterEmail: actor.email, invitedEmail: email, roleName, signInUrl: signInUrl() }),
    });
    return true;
  } catch (e) {
    console.error("[members] invite email failed:", (e as Error).message);
    return false;
  }
}

async function stampSent(id: string): Promise<string> {
  const at = new Date().toISOString();
  await supabaseAdmin().from("admin_users").update({ invite_sent_at: at }).eq("id", id);
  return at;
}

export type InviteResult = { ok: true; member: MemberRow; emailSent: boolean } | Refusal;

/**
 * Invite a Member: an Invited row with an assignable role, its first Staff
 * profile, and the invite email. A failed email does not undo the invite —
 * the row stays and the caller offers Resend. Audited as `member.invite`.
 */
export async function inviteMember(
  actor: AdminContext,
  input: { email: string; roleId: string; profileName?: string | null },
): Promise<InviteResult> {
  const email = input.email.trim().toLowerCase();
  const roles = await listRoles();
  const role = roles.find((r) => r.id === input.roleId);
  if (!role) return { ok: false, status: 400, error: "That role no longer exists." };
  const decision = canAssignRole(actor, role);
  if (!decision.ok) return decision;

  const admin = supabaseAdmin();
  const { data: existing, error: findError } = await admin
    .from("admin_users")
    .select(MEMBER_COLUMNS)
    .ilike("email", escapeLikePattern(email))
    .maybeSingle<DbMember>();
  if (findError) throw new Error(findError.message);
  if (existing) {
    return {
      ok: false,
      status: 409,
      error: `${existing.email} is already a Member (${STATUS_LABEL[memberStatus(existing)]}).`,
    };
  }

  const { data: row, error } = await admin
    .from("admin_users")
    .insert({
      email,
      role_id: role.id,
      is_active: true,
      invited_by: actor.memberId,
      invited_at: new Date().toISOString(),
    })
    .select(MEMBER_COLUMNS)
    .single<DbMember>();
  if (error) {
    if (/duplicate key|unique/i.test(error.message)) {
      return { ok: false, status: 409, error: `${email} is already a Member.` };
    }
    throw new Error(error.message);
  }

  const profileName = input.profileName?.trim() || defaultProfileName(email);
  await createStaffProfile(actor, row.id, profileName).catch(() => null);

  const emailSent = await sendInviteEmail(actor, email, role.name);
  if (emailSent) row.invite_sent_at = await stampSent(row.id);

  await recordAdminAction({
    actor,
    action: "member.invite",
    entityType: "member",
    entityId: row.id,
    after: { email, role: role.name, status: "invited", profile: profileName, emailSent },
  });
  return { ok: true, member: toMember(row, new Map()), emailSent };
}

/** Load an Invited Member the actor may manage, or the refusal. */
async function invitedTarget(actor: AdminContext, id: string): Promise<{ row: DbMember; role: PolicyRole } | Refusal> {
  const { data: row, error } = await supabaseAdmin()
    .from("admin_users")
    .select(MEMBER_COLUMNS)
    .eq("id", id)
    .maybeSingle<DbMember>();
  if (error) throw new Error(error.message);
  if (!row) return { ok: false, status: 404, error: "Member not found." };
  if (memberStatus(row) !== "invited") {
    return { ok: false, status: 409, error: `${row.email} has already signed in; deactivate them instead.` };
  }
  const roles = await listRoles();
  const byId = new Map<string, PolicyRole>(roles.map((r) => [r.id, r]));
  // Same rules as any change to a Member: not yourself, Owner only by an Owner,
  // and only a role the actor could have given. The owner count is moot for an
  // invite, so pass one more than enough.
  const decision = canUpdateMember(actor, { id: row.id, roleId: row.role_id, isActive: row.is_active }, {}, byId, 2);
  if (!decision.ok) return decision;
  return { row, role: byId.get(row.role_id)! };
}

export type ResendResult = { ok: true; member: MemberRow; emailSent: boolean } | Refusal;

/** Re-send an invite; refused within a minute of the last send. Audited as `member.invite_resend`. */
export async function resendInvite(actor: AdminContext, id: string, now = Date.now()): Promise<ResendResult> {
  const target = await invitedTarget(actor, id);
  if ("ok" in target) return target;
  const { row, role } = target;
  const last = row.invite_sent_at ? Date.parse(row.invite_sent_at) : 0;
  if (now - last < RESEND_COOLDOWN_MS) {
    return { ok: false, status: 429, error: "The invite just went out. Wait a minute before resending." };
  }
  const emailSent = await sendInviteEmail(actor, row.email, role.name);
  if (emailSent) row.invite_sent_at = await stampSent(row.id);
  await recordAdminAction({
    actor,
    action: "member.invite_resend",
    entityType: "member",
    entityId: row.id,
    before: { email: row.email, sentAt: last ? new Date(last).toISOString() : null },
    after: { email: row.email, sentAt: row.invite_sent_at ?? null, emailSent },
  });
  return { ok: true, member: toMember(row, new Map()), emailSent };
}

/**
 * Revoke an invite: delete the Invited Member and its Staff profiles. A
 * profile already used as a Result's "measured by" (or whose use can't be
 * checked) is archived and moved to the revoker instead, so attribution
 * survives. Audited as `member.invite_revoke`.
 *
 * The invitee may sign in while this runs. Every step is conditioned on the
 * row still being unbound, and profiles are parked under the revoker until the
 * Member row is gone, so a sign-in in between leaves them as they were.
 */
export async function revokeInvite(actor: AdminContext, id: string): Promise<{ ok: true } | Refusal> {
  const target = await invitedTarget(actor, id);
  if ("ok" in target) return target;
  const { row, role } = target;
  const admin = supabaseAdmin();
  const signedIn: Refusal = { ok: false, status: 409, error: `${row.email} has just signed in; deactivate them instead.` };

  const { data: profiles, error: pErr } = await admin
    .from("mp_staff")
    .select("id, name, archived_at")
    .eq("admin_user_id", id);
  if (pErr) throw new Error(pErr.message);
  const own = (profiles ?? []) as { id: string; name: string; archived_at: string | null }[];

  // 1. Park the profiles under the revoker, archived (frees the FK).
  const parkedAt = new Date().toISOString();
  for (const p of own) {
    const { error } = await admin
      .from("mp_staff")
      .update({ admin_user_id: actor.memberId, archived_at: p.archived_at ?? parkedAt })
      .eq("id", p.id);
    if (error) throw new Error(error.message);
  }

  // 2. Delete the Member only while still unbound.
  const { data: deleted, error } = await admin
    .from("admin_users")
    .delete()
    .eq("id", id)
    .is("auth_user_id", null)
    .select("id");
  if (error || !(deleted ?? []).length) {
    // Signed in meanwhile (or the delete failed): put the profiles back.
    for (const p of own) {
      await admin.from("mp_staff").update({ admin_user_id: id, archived_at: p.archived_at }).eq("id", p.id);
    }
    if (error) throw new Error(error.message);
    return signedIn;
  }

  // 3. Drop the parked profiles nothing names; keep any a Result uses.
  const kept: string[] = [];
  for (const p of own) {
    const { count, error: cErr } = await admin
      .from("mp_config_responses")
      .select("id", { count: "exact", head: true })
      .eq("measured_by_staff_id", p.id);
    if (cErr || count) {
      kept.push(p.name);
      continue;
    }
    await admin.from("mp_staff").delete().eq("id", p.id);
  }

  await recordAdminAction({
    actor,
    action: "member.invite_revoke",
    entityType: "member",
    entityId: id,
    before: { email: row.email, role: role.name, status: "invited" },
    after: kept.length ? { archivedProfilesMovedToRevoker: kept } : null,
  });
  return { ok: true };
}
