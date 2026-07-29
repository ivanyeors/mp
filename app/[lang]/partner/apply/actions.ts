"use server";

import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendReacceptEmail } from "@/lib/email/partner";
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
 * INSERT-only: a user who already has a partner_users row (any status) is
 * bounced to the hub without mutation — re-submitting must never reset an
 * approved/rejected row back to `pending` (Staff owns approval, #76). On success
 * redirects to the hub ("under review"). Returns field errors on invalid input.
 */
export async function submitApplication(
  lang: string,
  fields: ApplicationFields,
  agreed: boolean,
): Promise<SubmitResult> {
  const user = await getAuthUser();
  if (!user?.email) return { fieldErrors: {}, formError: "You must be signed in to apply." };
  if (!agreed) return { fieldErrors: {}, formError: "You must accept the Partner Agreement to apply." };

  const fieldErrors = validateApplication(fields);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const admin = supabaseAdmin();

  // Insert-only guard: existing application → hub, don't touch its status.
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
    questionnaire: fields,
    agreed_version: AGREEMENT_VERSION,
    agreed_at: new Date().toISOString(),
    application_status: "pending",
  });

  if (error) return { fieldErrors: {}, formError: error.message };

  redirect(withLocale("/partner", resolveLocale(lang)));
}

/**
 * Re-records acceptance of the current agreement version for an already-approved
 * partner (after AGREEMENT_VERSION bumps). Requires the "I agree" flag and is
 * status-guarded to `approved` rows only, so it can never advance a pending or
 * rejected application. Scoped to the signed-in user's row; redirects to the hub.
 */
export async function reacceptAgreement(lang: string, agreed: boolean): Promise<void> {
  const user = await getAuthUser();
  if (!user?.email) redirect(withLocale("/account/login?next=/partner", resolveLocale(lang)));
  if (!agreed) redirect(withLocale("/partner", resolveLocale(lang)));

  const admin = supabaseAdmin();
  await admin
    .from("partner_users")
    .update({ agreed_version: AGREEMENT_VERSION, agreed_at: new Date().toISOString() })
    .eq("auth_user_id", user.id)
    .eq("application_status", "approved"); // never advances pending/rejected

  // Re-accept confirmation email (#84), best-effort, once per (partner, version).
  // Runs before the redirect() (which throws NEXT_REDIRECT) so it isn't skipped.
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
