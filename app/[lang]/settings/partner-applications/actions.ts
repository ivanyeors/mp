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

// Staff review queue for partner applications (#76). Gated on the page's own
// 'partner-applications' permission (ADR 0023). Server actions are
// CSRF-safe and exempt from the settings static route-guard test.
const PERM = "partner-applications";
const QUEUE_PATH = "/settings/partner-applications";
const SUPPORT_EMAIL = "sg@mpillow.com";
/** A typo guard, far above any pool the Schedule would set. */
const MAX_COMMISSION_POOL = 1000;

/**
 * Send the outcome email through the idempotent partner ledger. The renderer
 * returns a fully shelled email, so nothing is wrapped here. Best-effort — a
 * failed send must not abort the DB transition. entity_id = the partner_users id.
 * A rejected application has no partner row, so partnerId is null there
 * (idempotency rests on the guarded reject action, which fires once).
 */
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

/**
 * Approve a pending application: create/claim the partner Location row
 * (type='partner') with the Commission Pool and customer discount Staff set
 * (ADR 0034), link it, mark approved, issue the Promo Code and email the
 * applicant their Approval Notice. The listing the applicant sent (logo,
 * write-up, website) goes onto the row, and `list` publishes it on
 * /our-partners at once (ADR 0052); Staff may leave it hidden instead.
 * Idempotent: an already-linked row is a no-op (never creates a second partners
 * row).
 */
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

  // Already approved + linked → nothing to do.
  if (status === "approved" && row.partner_id) return { ok: true };
  if (!canTransitionApplication(status, "approved")) {
    throw new Error(`Cannot approve an application that is ${status}.`);
  }

  const q = (row.questionnaire ?? {}) as Partial<ApplicationFields> & {
    address?: string;
    postal_code?: string;
  };

  // The applicant's own upload only: the questionnaire is jsonb, so never
  // trust a URL in it that isn't in their applicant folder in our storage.
  const logoUrl =
    row.auth_user_id && isStoredLogoUrl(q.logoUrl, applicantLogoFolder(row.auth_user_id as string))
      ? (q.logoUrl as string)
      : null;
  const description = typeof q.description === "string" ? q.description.trim() || null : null;

  // Create the partners (Location) row unless one is already linked.
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
        visible: list, // Approval publishes the listing unless Staff keep it hidden (ADR 0052).
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

  // Guarded on the status we read: the applicant may withdraw (delete) the
  // application while Staff approve it, and then nothing may be approved.
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

  // The Approval Notice states the Promo Code (agreement clause 1.1), so it is
  // issued now rather than on the partner's first Hub visit.
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

/** Reject a pending application: mark rejected, email the applicant. */
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
  if (status === "rejected") return { ok: true }; // idempotent
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
    partnerId: null, // a rejected application never creates a partners row
  });
  revalidatePath(QUEUE_PATH);
  return { ok: true };
}
