import { cache } from "react";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthIdentity } from "@/lib/auth/user";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import { withLocale } from "@/lib/i18n/routing";
import { createStaffProfile, defaultProfileName } from "@/lib/staff/admin";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import {
  hasPermission,
  isBootstrapEmail,
  parseBootstrapEmails,
  permissionsForRoleRow,
  type Permission,
} from "@/lib/auth/permissions";

export interface AdminContext {
  memberId: string;
  userId: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isOwner: boolean;
  grantsAll: boolean;
  permissions: ReadonlySet<Permission>;
  isBootstrap: boolean;
}

const ALWAYS_ALLOWED_SETTINGS_EMAILS = ["sg@mpillow.com", "admin@mpillow.com"];

function bootstrapEmails(): string[] {
  const fromEnv = parseBootstrapEmails(process.env.ADMIN_BOOTSTRAP_EMAILS);
  return Array.from(
    new Set([...ALWAYS_ALLOWED_SETTINGS_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]),
  );
}

type RoleRow = { id: string; key: string; name: string; grants_all: boolean; permissions: string[] | null };
type MemberRow = {
  id: string;
  is_active: boolean;
  auth_user_id: string | null;
  role: RoleRow | RoleRow[] | null;
};

const MEMBER_SELECT = "id, is_active, auth_user_id, role:admin_roles(id, key, name, grants_all, permissions)";

function roleOf(row: MemberRow): RoleRow | null {
  return (Array.isArray(row.role) ? row.role[0] : row.role) ?? null;
}

function contextFor(
  member: { id: string },
  role: RoleRow,
  identity: { userId: string; email: string },
  isBootstrap: boolean,
): AdminContext {
  return {
    memberId: member.id,
    userId: identity.userId,
    email: identity.email,
    roleId: role.id,
    roleKey: role.key,
    roleName: role.name,
    isOwner: role.key === "owner",
    grantsAll: role.grants_all,
    permissions: permissionsForRoleRow(role),
    isBootstrap,
  };
}

export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const user = await getAuthIdentity();
  if (!user?.email) return null;

  const email = user.email.toLowerCase().trim();
  const identity = { userId: user.id, email };
  const admin = supabaseAdmin();

  const { data: byAuthId } = await admin
    .from("admin_users")
    .select(MEMBER_SELECT)
    .eq("auth_user_id", user.id)
    .maybeSingle<MemberRow>();

  let row = byAuthId;

  if (!row) {
    const { data: byEmail } = await admin
      .from("admin_users")
      .select(MEMBER_SELECT)
      .ilike("email", escapeLikePattern(email))
      .maybeSingle<MemberRow>();
    if (byEmail?.auth_user_id && byEmail.auth_user_id !== user.id) return null;
    row = byEmail;
    if (row && !row.auth_user_id) {
      if (!row.is_active) return null;
      const { data: bound } = await admin
        .from("admin_users")
        .update({ auth_user_id: user.id })
        .eq("id", row.id)
        .is("auth_user_id", null)
        .select("id")
        .maybeSingle();
      if (!bound) return null;
    }
  }

  if (row) {
    if (!row.is_active) return null;
    const role = roleOf(row);
    if (!role) return null;
    return contextFor(row, role, identity, false);
  }

  if (isBootstrapEmail(email, bootstrapEmails())) {
    const { data: owner } = await admin
      .from("admin_roles")
      .select("id, key, name, grants_all, permissions")
      .eq("key", "owner")
      .maybeSingle<RoleRow>();
    if (!owner) return null;
    const { data: inserted } = await admin
      .from("admin_users")
      .insert({ auth_user_id: user.id, email, role_id: owner.id, is_active: true })
      .select("id")
      .maybeSingle<{ id: string }>();
    if (!inserted) return null;
    await createStaffProfile(null, inserted.id, defaultProfileName(email)).catch(() => null);
    return contextFor(inserted, owner, identity, true);
  }

  return null;
});

export async function requireAdmin(permission: Permission): Promise<NextResponse | null> {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(ctx, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function requireAnyAdmin(permissions: Permission[]): Promise<NextResponse | null> {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.some((permission) => hasPermission(ctx, permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function adminCanSeeCost(): Promise<boolean> {
  const ctx = await getAdminContext();
  return ctx !== null && hasPermission(ctx, "costings");
}

export async function requireAdminContext(permission: Permission): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(ctx, permission)) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return ctx;
}

export async function assertAdmin(permission: Permission): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("Unauthorized");
  if (!hasPermission(ctx, permission)) throw new Error("Forbidden");
  return ctx;
}

export async function assertAnyAdmin(permissions: Permission[]): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("Unauthorized");
  if (!permissions.some((permission) => hasPermission(ctx, permission))) {
    throw new Error("Forbidden");
  }
  return ctx;
}

export async function requireAdminPage(
  permission: Permission,
  locale: Locale = DEFAULT_LOCALE,
): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) {
    const adminHome = withLocale("/settings", locale);
    redirect(
      withLocale(`/account/login?next=${encodeURIComponent(adminHome)}`, locale),
    );
  }
  if (!hasPermission(ctx, permission)) {
    redirect(withLocale(`/settings?denied=${encodeURIComponent(permission)}`, locale));
  }
  return ctx;
}
