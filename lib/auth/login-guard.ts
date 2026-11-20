import { supabaseAdmin } from "@/lib/supabase/server";
import { permissionEntry, permissionsForRoleRow, type Permission } from "@/lib/auth/permissions";
import type { PolicyActor } from "@/lib/auth/role-policy";

export type LoginRefusal = { ok: false; status: 403 | 404; error: string };

export async function loginRefusal(actor: PolicyActor, memberId: string): Promise<LoginRefusal | null> {
  const admin = supabaseAdmin();
  const { data: member, error } = await admin.from("admin_users").select("id,role_id").eq("id", memberId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) return { ok: false, status: 404, error: "That login no longer exists." };
  const { data: role, error: roleError } = await admin
    .from("admin_roles")
    .select("key,name,grants_all,permissions")
    .eq("id", member.role_id)
    .maybeSingle();
  if (roleError) throw new Error(roleError.message);
  if (!role) return actor.grantsAll ? null : { ok: false, status: 403, error: "That login's role can't be read." };

  if (role.key === "owner" && !actor.isOwner) {
    return { ok: false, status: 403, error: "Only an Owner can change the people under an Owner's login." };
  }
  if (actor.grantsAll) return null;
  if (role.grants_all) {
    return { ok: false, status: 403, error: "Only an Owner or Admin can change the people under that login." };
  }
  const beyond = [...permissionsForRoleRow(role as { grants_all: boolean; permissions: string[] | null })].filter(
    (k) => !actor.permissions.has(k),
  ) as Permission[];
  if (beyond.length) {
    return {
      ok: false,
      status: 403,
      error: `That login's role has pages you don't have: ${beyond.map((k) => permissionEntry(k).label).join(", ")}.`,
    };
  }
  return null;
}
