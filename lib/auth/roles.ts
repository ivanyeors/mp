/**
 * Custom role writes for Users & permissions → Roles (ADR 0023).
 *
 * Every write runs the pure rules in `role-policy.ts` against fresh rows,
 * saves permissions closed under `requires`, and is audited with the
 * before/after permission arrays (`role.create | role.update | role.delete`).
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AdminContext } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { listRoles, type RoleRow } from "@/lib/auth/members";
import type { Permission } from "@/lib/auth/permissions";
import {
  canCreateRole,
  canDeleteRole,
  canEditRole,
  normalizeRolePermissions,
  type Decision,
} from "@/lib/auth/role-policy";

type Refusal = Exclude<Decision, { ok: true }>;
export type RoleWriteResult = { ok: true; role: RoleRow } | Refusal;

const ROLE_COLUMNS = "id, key, name, description, is_system, grants_all, permissions";

/** A role key from its name: lowercase words joined by dashes, unique among `taken`. */
export function roleKeyFor(name: string, taken: ReadonlySet<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "role";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}-${n}`;
  return key;
}

const snapshot = (r: { name: string; description: string | null; permissions: readonly string[] }) => ({
  name: r.name,
  description: r.description,
  permissions: [...r.permissions].sort(),
});

function isDuplicate(message: string) {
  return /duplicate key|unique/i.test(message);
}

const DUPLICATE_NAME: Refusal = { ok: false, status: 409, error: "A role with that name already exists." };

export async function createRole(
  actor: AdminContext,
  input: { name: string; description: string | null; permissions: readonly string[] },
): Promise<RoleWriteResult> {
  const normalized = normalizeRolePermissions(input.permissions);
  if (!normalized.ok) return normalized;
  const decision = canCreateRole(actor, normalized.permissions);
  if (!decision.ok) return decision;

  const roles = await listRoles();
  if (roles.some((r) => r.name.trim().toLowerCase() === input.name.trim().toLowerCase())) return DUPLICATE_NAME;
  const key = roleKeyFor(input.name, new Set(roles.map((r) => r.key)));

  const { data, error } = await supabaseAdmin()
    .from("admin_roles")
    .insert({
      key,
      name: input.name.trim(),
      description: input.description,
      is_system: false,
      grants_all: false,
      permissions: normalized.permissions,
    })
    .select(ROLE_COLUMNS)
    .single<Omit<RoleRow, "memberCount">>();
  if (error) {
    if (isDuplicate(error.message)) return DUPLICATE_NAME;
    throw new Error(error.message);
  }

  await recordAdminAction({
    actor,
    action: "role.create",
    entityType: "role",
    entityId: data.id,
    after: snapshot(data),
  });
  return { ok: true, role: { ...data, permissions: data.permissions ?? [], memberCount: 0 } };
}

export async function updateRole(
  actor: AdminContext,
  id: string,
  input: { name?: string; description?: string | null; permissions?: readonly string[] },
): Promise<RoleWriteResult> {
  const roles = await listRoles();
  const role = roles.find((r) => r.id === id);
  if (!role) return { ok: false, status: 404, error: "Role not found." };

  let permissions = role.permissions as Permission[];
  if (input.permissions !== undefined) {
    const normalized = normalizeRolePermissions(input.permissions);
    if (!normalized.ok) return normalized;
    permissions = normalized.permissions;
  }
  // Renaming and re-describing are edits too: the same rules apply.
  const decision = canEditRole(actor, role, permissions);
  if (!decision.ok) return decision;
  if (
    input.name !== undefined &&
    roles.some((r) => r.id !== id && r.name.trim().toLowerCase() === input.name!.trim().toLowerCase())
  ) {
    return DUPLICATE_NAME;
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description;
  if (input.permissions !== undefined) patch.permissions = permissions;

  const before = snapshot(role);
  const { data, error } = await supabaseAdmin()
    .from("admin_roles")
    .update(patch)
    .eq("id", id)
    .select(ROLE_COLUMNS)
    .single<Omit<RoleRow, "memberCount">>();
  if (error) {
    if (isDuplicate(error.message)) return DUPLICATE_NAME;
    throw new Error(error.message);
  }

  await recordAdminAction({
    actor,
    action: "role.update",
    entityType: "role",
    entityId: id,
    before,
    after: snapshot(data),
  });
  return { ok: true, role: { ...data, permissions: data.permissions ?? [], memberCount: role.memberCount } };
}

export async function deleteRole(actor: AdminContext, id: string): Promise<{ ok: true } | Refusal> {
  const roles = await listRoles();
  const role = roles.find((r) => r.id === id);
  if (!role) return { ok: false, status: 404, error: "Role not found." };
  const decision = canDeleteRole(actor, role, role.memberCount);
  if (!decision.ok) return decision;

  const { error } = await supabaseAdmin().from("admin_roles").delete().eq("id", id);
  if (error) {
    // A Member took the role between the count and the delete (FK restrict).
    if (/foreign key|violates/i.test(error.message)) {
      return { ok: false, status: 409, error: `Members hold ${role.name}. Move them to another role first.` };
    }
    throw new Error(error.message);
  }

  await recordAdminAction({
    actor,
    action: "role.delete",
    entityType: "role",
    entityId: id,
    before: snapshot(role),
  });
  return { ok: true };
}
