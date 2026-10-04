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

/** A signed-in, active Member with their role's permissions (ADR 0023). */
export interface AdminContext {
  /** `admin_users.id` — the Member. */
  memberId: string;
  /** Supabase auth user id. */
  userId: string;
  email: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  /** Holds the built-in Owner role. */
  isOwner: boolean;
  /** Holds a built-in role that grants every permission (Owner, Admin). */
  grantsAll: boolean;
  permissions: ReadonlySet<Permission>;
  /** True when access is granted via the bootstrap allowlist. */
  isBootstrap: boolean;
}

/**
 * Settings logins that are always allowed regardless of env configuration.
 * These bootstrap an owner row on first sign-in (see {@link getAdminContext}).
 */
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

/** The Member and their role in one round trip. */
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

/**
 * Resolves the admin context for the current Supabase session, or null when
 * the visitor is not an authorized, active Member.
 *
 * Resolution order:
 *  1. `admin_users` row matched by auth user id.
 *  2. `admin_users` row matched by email (links the auth id on first match —
 *     this is how an Invited Member becomes Active). A row already bound to a
 *     different auth user is refused, never shared.
 *  3. First-admin bootstrap: an allowlisted email auto-provisions an Owner row.
 *
 * The role's permissions come from `admin_roles` in the same query, so a role
 * or membership change applies on the caller's next request. Memoised per
 * request with React `cache()` so the settings layout gate, an RSC page guard
 * and any server action in the same render share one lookup.
 */
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
    // A matching email is not ownership once the row is bound to another user.
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
      // Another sign-in bound the row between the read and this write.
      if (!bound) return null;
    }
  }

  if (row) {
    if (!row.is_active) return null;
    const role = roleOf(row);
    // A Member without a readable role gets nothing, never a default.
    if (!role) return null;
    return contextFor(row, role, identity, false);
  }

  // First-admin bootstrap: provision an Owner row for an allowlisted email.
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
    // Every Member has a Staff profile (ADR 0023); best-effort, never blocks sign-in.
    await createStaffProfile(null, inserted.id, defaultProfileName(email)).catch(() => null);
    return contextFor(inserted, owner, identity, true);
  }

  return null;
});

/**
 * Route-handler guard. Returns a denial `NextResponse` (401/403) when the
 * caller is not an authorized staff member with `permission`, otherwise null.
 *
 *   const denied = await requireAdmin("orders");
 *   if (denied) return denied;
 */
export async function requireAdmin(permission: Permission): Promise<NextResponse | null> {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(ctx, permission)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Route-handler guard accepting any one of several permissions. Returns a
 * denial `NextResponse` (401/403) when the caller holds none of them.
 */
export async function requireAnyAdmin(permissions: Permission[]): Promise<NextResponse | null> {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!permissions.some((permission) => hasPermission(ctx, permission))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/**
 * Like {@link requireAdmin} but returns the admin context on success so callers
 * (e.g. audit logging) can attribute the action. Throws the denial response.
 */
export async function requireAdminContext(permission: Permission): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(ctx, permission)) {
    throw NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return ctx;
}

/**
 * Server-action guard. Throws a plain `Error` (rather than a `NextResponse`)
 * so it surfaces cleanly through React Server Actions. Returns the admin
 * context on success for audit attribution.
 *
 *   await assertAdmin("orders");
 */
export async function assertAdmin(permission: Permission): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("Unauthorized");
  if (!hasPermission(ctx, permission)) throw new Error("Forbidden");
  return ctx;
}

/**
 * {@link assertAdmin} for a server action shared by several pages: the caller
 * needs any one of the pages' permissions.
 */
export async function assertAnyAdmin(permissions: Permission[]): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) throw new Error("Unauthorized");
  if (!permissions.some((permission) => hasPermission(ctx, permission))) {
    throw new Error("Forbidden");
  }
  return ctx;
}

/**
 * Server-component / page guard. Redirects to Sign in when not signed in, or
 * to the Admin Panel home with `?denied=<key>` when signed in but lacking
 * `permission`, where General shows which page was refused and why.
 */
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
