import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { requireActivePartnerPage } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { signedImageUrl } from "@/lib/payout-upload";
import { SUPPORT_WHATSAPP_DIGITS } from "@/lib/contact";
import { PartnerSettingsClient } from "./settings-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PartnerSettingsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  // Guard: approved, linked, AND on the current agreement (re-accept bounces to
  // /partner). Not-signed-in / non-partner / stale-session handled upstream.
  const ctx = await requireActivePartnerPage(locale);

  const admin = supabaseAdmin();
  const [{ data: partner }, { data: pu }, { data: pay }] = await Promise.all([
    admin
      .from("partners")
      .select("name, description, address, postal_code, logo_url, notify_whatsapp")
      .eq("id", ctx.partnerId)
      .maybeSingle(),
    admin
      .from("partner_users")
      .select("backup_email, backup_email_verified, backup_email_pending")
      .eq("auth_user_id", ctx.userId)
      .maybeSingle(),
    admin
      .from("partner_payment_details")
      .select("paynow_qr_path, bank_name, bank_account_name, bank_account_number")
      .eq("partner_id", ctx.partnerId)
      .maybeSingle(),
  ]);

  // Sign the partner's OWN private QR for preview (short-lived). Query is scoped to
  // ctx.partnerId, so a partner only ever gets a link to their own image.
  const qrUrl = await signedImageUrl(pay?.paynow_qr_path ?? null);

  return (
    <PartnerSettingsClient
      whatsappNumber={SUPPORT_WHATSAPP_DIGITS}
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
      notifyWhatsapp={Boolean(partner?.notify_whatsapp)}
      paymentDetails={{
        qrUrl,
        bank_name: pay?.bank_name ?? "",
        bank_account_name: pay?.bank_account_name ?? "",
        bank_account_number: pay?.bank_account_number ?? "",
      }}
    />
  );
}
