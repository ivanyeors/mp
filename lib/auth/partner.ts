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

export async function loadPartnerRow(user: User): Promise<PartnerRow | null> {
  const admin = supabaseAdmin();

  const { data: byAuthId } = await admin
    .from("partner_users")
    .select(PARTNER_ROW_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (byAuthId) return byAuthId as PartnerRow;

  const email = (user.email ?? "").toLowerCase().trim();
  if (!email || !user.email_confirmed_at) return null;

  const { data: byEmail } = await admin
    .from("partner_users")
    .select(PARTNER_ROW_COLUMNS)
    .ilike("email", escapeLikePattern(email))
    .maybeSingle();

  if (byEmail) {
    if (byEmail.auth_user_id && byEmail.auth_user_id !== user.id) return null;
    if (!byEmail.auth_user_id) {
      await admin
        .from("partner_users")
        .update({ auth_user_id: user.id })
        .eq("id", byEmail.id)
        .is("auth_user_id", null);
      return { ...byEmail, auth_user_id: user.id } as PartnerRow;
    }
    return byEmail as PartnerRow;
  }

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

export async function getPartnerContext(): Promise<PartnerContext | null> {
  const user = await getAuthUser();
  if (!user?.email) return null;
  if (!isPartnerSessionFresh(user.last_sign_in_at, new Date())) return null;
  const row = await loadPartnerRow(user);
  if (!row) return null;
  return buildPartnerContext(user, row);
}

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

export type ActivePartnerContext = PartnerContext & { partnerId: string; status: "approved" };

export function isPartnerActive(ctx: PartnerContext | null): ctx is ActivePartnerContext {
  return Boolean(
    ctx && ctx.status === "approved" && ctx.partnerId && !needsReaccept(ctx.agreedVersion),
  );
}

export async function requireActivePartnerPage(
  locale: Locale = DEFAULT_LOCALE,
): Promise<ActivePartnerContext> {
  const ctx = await requirePartnerPage(locale);
  if (!isPartnerActive(ctx)) {
    redirect(withLocale("/partner", locale));
  }
  return ctx;
}
