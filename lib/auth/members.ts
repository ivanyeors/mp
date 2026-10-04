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
import {
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
};

const MEMBER_COLUMNS = "id, email, role_id, is_active, auth_user_id, created_at";
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
