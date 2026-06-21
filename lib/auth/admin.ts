import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import {
  isBootstrapEmail,
  parseBootstrapEmails,
  roleHasPermission,
  type AdminRole,
  type Permission,
} from "@/lib/auth/permissions";

export interface AdminContext {
  userId: string;
  email: string;
  role: AdminRole;
  /** True when access is granted via the bootstrap allowlist. */
  isBootstrap: boolean;
}

function bootstrapEmails(): string[] {
  return parseBootstrapEmails(process.env.ADMIN_BOOTSTRAP_EMAILS);
}

/**
 * Resolves the admin context for the current Supabase session, or null when
 * the visitor is not an authorized, active staff member.
 *
 * Resolution order:
 *  1. `admin_users` row matched by auth user id.
 *  2. `admin_users` row matched by email (links the auth id on first match).
 *  3. First-admin bootstrap: an allowlisted email auto-provisions an owner row.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;

  const email = user.email.toLowerCase().trim();
  const admin = supabaseAdmin();

  const { data: byAuthId } = await admin
    .from("admin_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let row = byAuthId;

  if (!row) {
    const { data: byEmail } = await admin
      .from("admin_users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    row = byEmail;
    if (row && !row.auth_user_id) {
      await admin.from("admin_users").update({ auth_user_id: user.id }).eq("id", row.id);
    }
  }

  if (row) {
    if (!row.is_active) return null;
    return { userId: user.id, email, role: row.role as AdminRole, isBootstrap: false };
  }

  // First-admin bootstrap: provision an owner row for an allowlisted email.
  if (isBootstrapEmail(email, bootstrapEmails())) {
    await admin
      .from("admin_users")
      .insert({ auth_user_id: user.id, email, role: "owner", is_active: true });
    return { userId: user.id, email, role: "owner", isBootstrap: true };
  }

  return null;
}

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
  if (!roleHasPermission(ctx.role, permission)) {
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
  if (!roleHasPermission(ctx.role, permission)) {
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
  if (!roleHasPermission(ctx.role, permission)) throw new Error("Forbidden");
  return ctx;
}

/**
 * Server-component / page guard. Redirects to the staff login when not signed
 * in, or to the settings overview when signed in but lacking `permission`.
 */
export async function requireAdminPage(
  permission: Permission,
  locale: Locale = DEFAULT_LOCALE,
): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect(withLocale("/settings/login", locale));
  if (!roleHasPermission(ctx.role, permission)) {
    redirect(withLocale("/settings", locale));
  }
  return ctx;
}
