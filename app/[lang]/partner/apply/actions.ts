"use server";

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { loadPartnerRow } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendReacceptEmail } from "@/lib/email/partner";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { removeApplicantLogos } from "@/lib/partner-upload";
import { applicantLogoFolder, isStoredLogoUrl } from "@/lib/partner-upload/urls";
import {
  AGREEMENT_VERSION,
  canWithdrawApplication,
  validateApplication,
  type ApplicationFields,
} from "@/lib/partner-application";

export type SubmitResult = {
  fieldErrors: Partial<Record<keyof ApplicationFields, string>>;
  formError?: string;
};

function resolveLocale(lang: string): Locale {
  return isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
}

function storedQuestionnaire(fields: ApplicationFields): ApplicationFields {
  const text = (v: unknown) => String(v ?? "").trim();
  return {
    companyName: text(fields.companyName),
    uen: text(fields.uen).toUpperCase(),
    website: text(fields.website),
    category: fields.category,
    contactName: text(fields.contactName),
    contactMobile: text(fields.contactMobile),
    businessEmail: text(fields.businessEmail),
    introPlan: text(fields.introPlan),
    description: text(fields.description),
    logoUrl: text(fields.logoUrl) || null,
  };
}

export async function submitApplication(
  lang: string,
  fields: ApplicationFields,
  agreed: boolean,
): Promise<SubmitResult> {
  const user = await getAuthUser();
  if (!user?.email) return { fieldErrors: {}, formError: "You must be signed in to apply." };
  if (!agreed) return { fieldErrors: {}, formError: "You must accept the Partner Agreement to apply." };

  const fieldErrors = validateApplication(fields);
  if (fields.logoUrl && !isStoredLogoUrl(fields.logoUrl, applicantLogoFolder(user.id))) {
    fieldErrors.logoUrl = "Upload your logo again.";
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("partner_users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existing) redirect(withLocale("/partner", resolveLocale(lang)));

  const email = user.email.toLowerCase().trim();
  const { error } = await admin.from("partner_users").insert({
    auth_user_id: user.id,
    email,
    questionnaire: storedQuestionnaire(fields),
    agreed_version: AGREEMENT_VERSION,
    agreed_at: new Date().toISOString(),
    application_status: "pending",
  });

  if (error) return { fieldErrors: {}, formError: error.message };

  redirect(withLocale("/partner", resolveLocale(lang)));
}

export type WithdrawResult = { error: string };

export async function withdrawApplication(lang: string): Promise<WithdrawResult> {
  const locale = resolveLocale(lang);
  const user = await getAuthUser();
  if (!user?.email) redirect(withLocale("/account/login?next=/partner", locale));

  const row = await loadPartnerRow(user);
  if (!row) redirect(withLocale("/partner/apply", locale));
  if (row.auth_user_id !== user.id || !canWithdrawApplication(row.application_status, row.partner_id)) {
    return { error: "Only an application that is still under review can be withdrawn." };
  }

  const { data: deleted, error } = await supabaseAdmin()
    .from("partner_users")
    .delete()
    .eq("id", row.id)
    .eq("auth_user_id", user.id)
    .eq("application_status", "pending")
    .is("partner_id", null)
    .select("id");
  if (error) return { error: error.message };
  if (!deleted?.length) {
    return { error: "Your application has just been reviewed, so it can no longer be withdrawn." };
  }

  await removeApplicantLogos(user.id);
  redirect(`${withLocale("/partner/apply", locale)}?withdrawn=1`);
}

export async function reacceptAgreement(lang: string, agreed: boolean): Promise<void> {
  const user = await getAuthUser();
  if (!user?.email) redirect(withLocale("/account/login?next=/partner", resolveLocale(lang)));
  if (!agreed) redirect(withLocale("/partner", resolveLocale(lang)));

  const admin = supabaseAdmin();
  await admin
    .from("partner_users")
    .update({ agreed_version: AGREEMENT_VERSION, agreed_at: new Date().toISOString() })
    .eq("auth_user_id", user.id)
    .eq("application_status", "approved");

  try {
    const { data: row } = await admin
      .from("partner_users")
      .select("partner_id, email")
      .eq("auth_user_id", user.id)
      .eq("application_status", "approved")
      .maybeSingle();
    if (row?.partner_id) {
      await sendReacceptEmail(admin, {
        partnerId: row.partner_id,
        agreementVersion: AGREEMENT_VERSION,
        to: row.email,
      });
    }
  } catch (err) {
    console.error("[partner-reaccept] email failed:", err);
  }

  redirect(withLocale("/partner", resolveLocale(lang)));
}
