import { redirect } from "next/navigation";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { getPartnerContext } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PartnerSettingsClient } from "./settings-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORT_WHATSAPP = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.trim() || "6587805311";

export default async function PartnerSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  const ctx = await getPartnerContext();
  if (!ctx || ctx.status !== "approved" || !ctx.partnerId) {
    redirect(withLocale("/partner", locale)); // /partner handles pending/rejected/sign-in
  }

  const admin = supabaseAdmin();
  const [{ data: partner }, { data: pu }] = await Promise.all([
    admin
      .from("partners")
      .select("name, description, address, postal_code, logo_url")
      .eq("id", ctx.partnerId)
      .maybeSingle(),
    admin
      .from("partner_users")
      .select("backup_email, backup_email_verified, backup_email_pending")
      .eq("auth_user_id", ctx.userId)
      .maybeSingle(),
  ]);

  return (
    <PartnerSettingsClient
      whatsappNumber={SUPPORT_WHATSAPP}
      initialProfile={{
        name: partner?.name ?? ctx.partnerName ?? "",
        description: partner?.description ?? "",
        address: partner?.address ?? "",
        postal_code: partner?.postal_code ?? "",
        logo_url: partner?.logo_url ?? null,
      }}
      backupEmail={{
        email: pu?.backup_email ?? null,
        verified: Boolean(pu?.backup_email_verified),
        pending: pu?.backup_email_pending ?? null,
      }}
    />
  );
}
