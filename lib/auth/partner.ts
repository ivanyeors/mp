import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";
import { isPartnerSessionFresh } from "@/lib/auth/partner-session";

export interface PartnerContext {
  userId: string;
  email: string;
  partnerId: string | null;
  status: "pending" | "approved" | "rejected";
  partnerName: string | null;
}

/**
 * Resolves the partner context for the current Supabase session, or null when
 * the visitor is not a partner (or their session is past the 7-day cap).
 *
 * Resolution order (mirrors {@link getAdminContext}):
 *  1. `partner_users` row matched by auth user id.
 *  2. `partner_users` row matched by email (links the auth id on first match).
 * Access is additive: a partner who is also a customer keeps their /account.
 */
export async function getPartnerContext(): Promise<PartnerContext | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;

  // 7-day absolute session cap: a stale session must re-authenticate. Only
  // partner surfaces enforce this; customer/staff surfaces are unaffected.
  if (!isPartnerSessionFresh(user.last_sign_in_at, new Date())) return null;

  const email = user.email.toLowerCase().trim();
  const admin = supabaseAdmin();

  const { data: byAuthId } = await admin
    .from("partner_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let row = byAuthId;

  if (!row) {
    const { data: byEmail } = await admin
      .from("partner_users")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    row = byEmail;
    if (row && !row.auth_user_id) {
      await admin.from("partner_users").update({ auth_user_id: user.id }).eq("id", row.id);
    }
  }

  if (!row) return null;

  let partnerName: string | null = null;
  if (row.partner_id) {
    const { data: partner } = await admin
      .from("partners")
      .select("name")
      .eq("id", row.partner_id)
      .maybeSingle();
    partnerName = partner?.name ?? null;
  }

  return {
    userId: user.id,
    email,
    partnerId: row.partner_id ?? null,
    status: row.application_status as PartnerContext["status"],
    partnerName,
  };
}

/**
 * Server-component / page guard. Redirects to Sign in (returning to /partner)
 * when the visitor is not a partner. Returns the context on success.
 */
export async function requirePartnerPage(locale: Locale = DEFAULT_LOCALE): Promise<PartnerContext> {
  const ctx = await getPartnerContext();
  if (!ctx) {
    redirect(withLocale("/account/login?next=/partner", locale));
  }
  return ctx;
}
