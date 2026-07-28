"use server";

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/server";
import { withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import {
  AGREEMENT_VERSION,
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

/**
 * Records a partner application for the signed-in user: the 8 questionnaire
 * fields (jsonb), the accepted agreement version + timestamp, status `pending`.
 * Idempotent on `auth_user_id`. On success redirects to the hub, which renders
 * the "under review" screen. Returns field errors when validation fails.
 */
export async function submitApplication(
  lang: string,
  fields: ApplicationFields,
): Promise<SubmitResult> {
  const user = await getAuthUser();
  if (!user?.email) return { fieldErrors: {}, formError: "You must be signed in to apply." };

  const fieldErrors = validateApplication(fields);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const email = user.email.toLowerCase().trim();
  const { error } = await supabaseAdmin()
    .from("partner_users")
    .upsert(
      {
        auth_user_id: user.id,
        email,
        questionnaire: fields,
        agreed_version: AGREEMENT_VERSION,
        agreed_at: new Date().toISOString(),
        application_status: "pending",
      },
      { onConflict: "auth_user_id" },
    );

  if (error) return { fieldErrors: {}, formError: error.message };

  redirect(withLocale("/partner", resolveLocale(lang)));
}

/**
 * Re-records acceptance of the current agreement version for an already-approved
 * partner (after AGREEMENT_VERSION bumps). Scoped to the signed-in user's row;
 * redirects back to the hub, which then renders.
 */
export async function reacceptAgreement(lang: string): Promise<void> {
  const user = await getAuthUser();
  if (!user?.email) redirect(withLocale("/account/login?next=/partner", resolveLocale(lang)));

  await supabaseAdmin()
    .from("partner_users")
    .update({ agreed_version: AGREEMENT_VERSION, agreed_at: new Date().toISOString() })
    .eq("auth_user_id", user.id);

  redirect(withLocale("/partner", resolveLocale(lang)));
}
