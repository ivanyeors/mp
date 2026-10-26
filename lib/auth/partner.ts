import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { isPartnerSessionFresh } from "@/lib/auth/partner-session";
import { needsReaccept } from "@/lib/partner-application";

export interface PartnerContext {
  userId: string;
  email: string;
  partnerId: string | null;
  status: "pending" | "approved" | "rejected";
  partnerName: string | null;
  /** Agreement version this partner last accepted (null = never / pre-migration). */
  agreedVersion: string | null;
}

interface PartnerRow {
  id: string;
  auth_user_id: string | null;
  partner_id: string | null;
  application_status: PartnerContext["status"];
  agreed_version: string | null;
}

const PARTNER_ROW_COLUMNS = "id, auth_user_id, partner_id, application_status, agreed_version";

/**
 * Loads the `partner_users` row for a signed-in user, or null when they are not
 * a partner. Resolution order (mirrors {@link getAdminContext}):
 *  1. matched by auth user id.
 *  2. matched by primary email (links the auth id on first match).
 *  3. matched by a VERIFIED backup email (a second sign-in identity → same
 *     partner row; never links auth_user_id, which belongs to the primary).
 * Every email lookup escapes LIKE wildcards (`escapeLikePattern`) so an address
 * containing `_`/`%` cannot adopt another partner's row.
 */
export async function loadPartnerRow(user: User): Promise<PartnerRow | null> {
  const admin = supabaseAdmin();

  const { data: byAuthId } = await admin
    .from("partner_users")
    .select(PARTNER_ROW_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (byAuthId) return byAuthId as PartnerRow;

  const email = (user.email ?? "").toLowerCase().trim();
  // Every match below is by email, so only an email the user proved counts.
  if (!email || !user.email_confirmed_at) return null;

  const { data: byEmail } = await admin
    .from("partner_users")
    .select(PARTNER_ROW_COLUMNS)
    .ilike("email", escapeLikePattern(email))
    .maybeSingle();

  if (byEmail) {
    // A row bound to another login is theirs, not this one's.
    if (byEmail.auth_user_id && byEmail.auth_user_id !== user.id) return null;
    if (!byEmail.auth_user_id) {
      await admin
        .from("partner_users")
        .update({ auth_user_id: user.id })
        .eq("id", byEmail.id)
        .is("auth_user_id", null);
    }
    return byEmail as PartnerRow;
  }

  // Backup email = a second verified sign-in identity resolving to the same
  // partner. Only a VERIFIED backup counts; never link auth_user_id here.
  const { data: byBackup } = await admin
    .from("partner_users")
    .select(PARTNER_ROW_COLUMNS)
    .ilike("backup_email", escapeLikePattern(email))
    .eq("backup_email_verified", true)
    .maybeSingle();

  return (byBackup as PartnerRow) ?? null;
}

async function buildPartnerContext(user: User, row: PartnerRow): Promise<PartnerContext> {
  let partnerName: string | null = null;
  if (row.partner_id) {
    const { data: partner } = await supabaseAdmin()
      .from("partners")
      .select("name")
      .eq("id", row.partner_id)
      .maybeSingle();
    partnerName = partner?.name ?? null;
  }
  return {
    userId: user.id,
    email: (user.email ?? "").toLowerCase().trim(),
    partnerId: row.partner_id ?? null,
    status: row.application_status,
    partnerName,
    agreedVersion: row.agreed_version ?? null,
  };
}

/**
 * Resolves the partner context for the current Supabase session, or null when
 * the visitor is not a partner OR their session is past the 7-day cap. Used by
 * the dock/pill status endpoint. Access is additive: a partner who is also a
 * customer keeps their /account.
 */
export async function getPartnerContext(): Promise<PartnerContext | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;
  // 7-day absolute cap: a stale session gets no pill (it must re-authenticate).
  if (!isPartnerSessionFresh(user.last_sign_in_at, new Date())) return null;
  const row = await loadPartnerRow(user);
  if (!row) return null;
  return buildPartnerContext(user, row);
}

/**
 * Server-component / page guard. Distinguishes three null cases so it never
 * loops through the login page (which bounces already-signed-in users):
 *  - not signed in            → Sign in (return to /partner)
 *  - signed in, not a partner → /partner/apply (self-serve application)
 *  - signed in, stale (>7d)   → Sign in with `reauth=1` so the login page shows
 *    the form instead of bouncing; a fresh sign-in refreshes `last_sign_in_at`.
 * Returns the context on success.
 */
export async function requirePartnerPage(locale: Locale = DEFAULT_LOCALE): Promise<PartnerContext> {
  const user = await getAuthUser();
  if (!user?.email) {
    redirect(withLocale("/account/login?next=/partner", locale));
  }
  const row = await loadPartnerRow(user);
  if (!row) {
    redirect(withLocale("/partner/apply", locale));
  }
  if (!isPartnerSessionFresh(user.last_sign_in_at, new Date())) {
    redirect(withLocale("/account/login?next=/partner&reauth=1", locale));
  }
  return buildPartnerContext(user, row);
}

/** An approved, linked partner who is on the current agreement version. */
export type ActivePartnerContext = PartnerContext & { partnerId: string; status: "approved" };

/**
 * True when the partner may use partner-only surfaces (settings, profile/logo/
 * backup-email APIs): approved, linked to a `partners` row, and NOT owing
 * re-acceptance after an agreement version bump. Narrows `partnerId` to non-null.
 * The single gate every mutation surface shares so a version bump can't be
 * bypassed by calling an API directly (page.tsx only gated the hub view).
 */
export function isPartnerActive(ctx: PartnerContext | null): ctx is ActivePartnerContext {
  return Boolean(
    ctx && ctx.status === "approved" && ctx.partnerId && !needsReaccept(ctx.agreedVersion),
  );
}

/**
 * Page guard for partner sub-pages that require an ACTIVE partner (e.g. Settings).
 * Builds on {@link requirePartnerPage} (sign-in / apply / stale-session handling)
 * then bounces to /partner when the partner isn't approved or still owes
 * re-acceptance — /partner renders the pending/rejected/re-accept screen. Never
 * call this from /partner itself (it would loop).
 */
export async function requireActivePartnerPage(
  locale: Locale = DEFAULT_LOCALE,
): Promise<ActivePartnerContext> {
  const ctx = await requirePartnerPage(locale);
  if (!isPartnerActive(ctx)) {
    redirect(withLocale("/partner", locale));
  }
  return ctx;
}
