import { cache } from "react";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthIdentity } from "@/lib/auth/user";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
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

/**
 * Resolves the admin context for the current Supabase session, or null when
 * the visitor is not an authorized, active staff member.
 *
 * Resolution order:
 *  1. `admin_users` row matched by auth user id.
 *  2. `admin_users` row matched by email (links the auth id on first match).
 *     A row already bound to a different auth user is refused, never shared.
 *  3. First-admin bootstrap: an allowlisted email auto-provisions an owner row.
 *
 * Memoised per request with React `cache()` so the settings layout gate, an
 * RSC page guard and any server action in the same render share one auth
 * round trip and one admin_users lookup.
 */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  const user = await getAuthIdentity();
  if (!user?.email) return null;

  const email = user.email.toLowerCase().trim();
  const admin = supabaseAdmin();

  const { data: byAuthId } = await admin
    .from("admin_users")
    .select("id, role, is_active, auth_user_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let row = byAuthId;

  if (!row) {
    const { data: byEmail } = await admin
      .from("admin_users")
      .select("id, role, is_active, auth_user_id")
      .ilike("email", escapeLikePattern(email))
      .maybeSingle();
    // A matching email is not ownership once the row is bound to another user.
    if (byEmail?.auth_user_id && byEmail.auth_user_id !== user.id) return null;
    row = byEmail;
    if (row && !row.auth_user_id) {
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
  if (!roleHasPermission(ctx.role, permission)) {
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
  if (!permissions.some((permission) => roleHasPermission(ctx.role, permission))) {
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
 * Server-component / page guard. Redirects to Sign in when not signed in, or
 * to the Admin Panel overview when signed in but lacking `permission`.
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
  if (!roleHasPermission(ctx.role, permission)) {
    redirect(withLocale("/settings", locale));
  }
  return ctx;
}
