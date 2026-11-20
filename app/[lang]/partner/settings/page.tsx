import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
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

  const ctx = await requireActivePartnerPage(locale);

  const admin = supabaseAdmin();
  const [{ data: partner }, { data: branches }, { data: pu }, { data: pay }] = await Promise.all([
    admin
      .from("partners")
      .select(
        "name, description, website_url, address, postal_code, branch_name, logo_url, visible, notify_whatsapp",
      )
      .eq("id", ctx.partnerId)
      .maybeSingle(),
    admin
      .from("partners")
      .select("id, branch_name, address, postal_code")
      .eq("parent_id", ctx.partnerId)
      .order("position", { ascending: true }),
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

  const qrUrl = await signedImageUrl(pay?.paynow_qr_path ?? null);

  return (
    <PartnerSettingsClient
      whatsappNumber={SUPPORT_WHATSAPP_DIGITS}
      initialProfile={{
        name: partner?.name ?? ctx.partnerName ?? "",
        description: partner?.description ?? "",
        website: partner?.website_url ?? "",
        logo_url: partner?.logo_url ?? null,
      }}
      listed={Boolean(partner?.visible)}
      partnersPageHref={withLocale("/our-partners", locale)}
      initialLocations={{
        main: {
          branch_name: partner?.branch_name ?? "",
          address: partner?.address ?? "",
          postal_code: partner?.postal_code ?? "",
        },
        branches: (branches ?? []).map((b) => ({
          id: b.id as string,
          branch_name: (b.branch_name as string | null) ?? "",
          address: (b.address as string | null) ?? "",
          postal_code: (b.postal_code as string | null) ?? "",
        })),
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
