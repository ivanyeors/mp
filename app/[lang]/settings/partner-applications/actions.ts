"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { toWebUrl } from "@/lib/format/web-url";
import { revalidatePath } from "next/cache";
import { invalidateTag } from "@/lib/cache/invalidate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import {
  APPLICATION_EMAIL_COPY,
  renderApplicationOutcomeEmail,
  type ApprovalNotice,
} from "@/lib/email/application";
import type { EmailCopySpec } from "@/lib/email/copy";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { dispatchPartnerEmail } from "@/lib/email/partner";
import { getSiteOrigin } from "@/lib/site-url";
import { ensureReferralCode } from "@/lib/referrals";
import { applicantLogoFolder, isStoredLogoUrl } from "@/lib/partner-upload/urls";
import {
  canTransitionApplication,
  type ApplicationFields,
  type ApplicationOutcome,
  type ApplicationStatus,
} from "@/lib/partner-application";

const PERM = "partner-applications";
const QUEUE_PATH = "/settings/partner-applications";
const SUPPORT_EMAIL = "sg@mpillow.com";
const MAX_COMMISSION_POOL = 1000;

async function sendOutcomeEmail(params: {
  admin: SupabaseClient;
  outcome: ApplicationOutcome;
  to: string;
  partnerUserId: string;
  partnerId: string | null;
  notice?: ApprovalNotice;
}): Promise<void> {
  try {
    const copy = await loadEmailCopy(APPLICATION_EMAIL_COPY[params.outcome] as EmailCopySpec);
    const rendered = renderApplicationOutcomeEmail(
      params.outcome,
      {
        partnerSignInUrl: `${getSiteOrigin()}/partner`,
        supportEmail: SUPPORT_EMAIL,
        notice: params.notice,
      },
      copy,
    );
    await dispatchPartnerEmail(params.admin, {
      partnerId: params.partnerId,
      template: `application_${params.outcome}`,
      entityId: params.partnerUserId,
      to: params.to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  } catch (err) {
    console.error(
      `[partner-application] failed to send ${params.outcome} email to ${params.to}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function approveApplication(
  id: string,
  terms: { pool: number; customerDiscount: boolean; list?: boolean },
): Promise<{ ok: true }> {
  const actor = await assertAdmin(PERM);
  const admin = supabaseAdmin();

  const pool = Number(terms?.pool);
  if (!Number.isFinite(pool) || pool < 0 || pool > MAX_COMMISSION_POOL) {
    throw new Error(`The Commission Pool must be between S$0 and S$${MAX_COMMISSION_POOL}.`);
  }
  const partnerTerms = {
    commission_pool: Math.round(pool * 100) / 100,
    customer_discount_enabled: terms.customerDiscount === true,
  };
  const list = terms.list !== false;

  const { data: row, error } = await admin
    .from("partner_users")
    .select("id, auth_user_id, email, partner_id, application_status, questionnaire")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Application not found");

  const status = row.application_status as ApplicationStatus;

  if (status === "approved" && row.partner_id) return { ok: true };
  if (!canTransitionApplication(status, "approved")) {
    throw new Error(`Cannot approve an application that is ${status}.`);
  }

  const q = (row.questionnaire ?? {}) as Partial<ApplicationFields> & {
    address?: string;
    postal_code?: string;
  };

  const logoUrl =
    row.auth_user_id && isStoredLogoUrl(q.logoUrl, applicantLogoFolder(row.auth_user_id as string))
      ? (q.logoUrl as string)
      : null;
  const description = typeof q.description === "string" ? q.description.trim() || null : null;

  let partnerId = row.partner_id as string | null;
  let createdPartner = false;
  if (!partnerId) {
    const { data: maxRow } = await admin
      .from("partners")
      .select("position")
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPosition = (maxRow?.position ?? -1) + 1;

    const { data: partner, error: partnerError } = await admin
      .from("partners")
      .insert({
        name: q.companyName || row.email,
        website_url: toWebUrl(q.website),
        logo_url: logoUrl,
        description,
        type: "partner",
        visible: list,
        position: nextPosition,
        address: q.address ?? null,
        postal_code: q.postal_code ?? null,
        ...partnerTerms,
      })
      .select("id")
      .single();
    if (partnerError) throw new Error(partnerError.message);
    partnerId = partner.id as string;
    createdPartner = true;
  } else {
    const { error: termsError } = await admin
      .from("partners")
      .update(list ? { ...partnerTerms, visible: true } : partnerTerms)
      .eq("id", partnerId);
    if (termsError) throw new Error(termsError.message);
  }

  const { data: approved, error: updateError } = await admin
    .from("partner_users")
    .update({ partner_id: partnerId, application_status: "approved" })
    .eq("id", id)
    .eq("application_status", status)
    .select("id");
  if (updateError) throw new Error(updateError.message);
  if (!approved?.length) {
    if (createdPartner) await admin.from("partners").delete().eq("id", partnerId);
    revalidatePath(QUEUE_PATH);
    throw new Error("This application was withdrawn or has already been reviewed.");
  }
  invalidateTag("locations");

  await recordAdminAction({
    actor,
    action: "partner_application.approve",
    entityType: "partner_user",
    entityId: id,
    before: { application_status: status, partner_id: row.partner_id },
    after: { application_status: "approved", partner_id: partnerId, listed: list, ...partnerTerms },
  });

  const promoCode = await ensureReferralCode(partnerId);

  await sendOutcomeEmail({
    admin,
    outcome: "approved",
    to: row.email,
    partnerUserId: id,
    partnerId,
    notice: {
      promoCode,
      territory: "Singapore",
      commissionPool: partnerTerms.commission_pool,
    },
  });
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}

export async function rejectApplication(id: string): Promise<{ ok: true }> {
  const actor = await assertAdmin(PERM);
  const admin = supabaseAdmin();

  const { data: row, error } = await admin
    .from("partner_users")
    .select("id, email, application_status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Application not found");

  const status = row.application_status as ApplicationStatus;
  if (status === "rejected") return { ok: true };
  if (!canTransitionApplication(status, "rejected")) {
    throw new Error(`Cannot reject an application that is ${status}.`);
  }

  const { data: rejected, error: updateError } = await admin
    .from("partner_users")
    .update({ application_status: "rejected" })
    .eq("id", id)
    .eq("application_status", status)
    .select("id");
  if (updateError) throw new Error(updateError.message);
  if (!rejected?.length) {
    revalidatePath(QUEUE_PATH);
    throw new Error("This application was withdrawn or has already been reviewed.");
  }

  await recordAdminAction({
    actor,
    action: "partner_application.reject",
    entityType: "partner_user",
    entityId: id,
    before: { application_status: status },
    after: { application_status: "rejected" },
  });

  await sendOutcomeEmail({
    admin,
    outcome: "rejected",
    to: row.email,
    partnerUserId: id,
    partnerId: null,
  });
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}
