"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { renderEmailShell } from "@/lib/email/base";
import { dispatchPartnerEmail } from "@/lib/email/partner";
import { getSiteOrigin } from "@/lib/site-url";
import {
  canTransitionApplication,
  renderApplicationOutcomeEmail,
  type ApplicationFields,
  type ApplicationOutcome,
  type ApplicationStatus,
} from "@/lib/partner-application";

// Staff review queue for partner applications (#76). Reuses the existing
// 'page-builder' admin permission (same as Locations CRUD). Server actions are
// CSRF-safe and exempt from the settings static route-guard test.
const PERM = "page-builder";
const QUEUE_PATH = "/settings/partner-applications";
const SUPPORT_EMAIL = "sg@mpillow.com";

/**
 * Send the outcome email through the idempotent partner ledger, wrapped in the
 * branded base (copy unchanged). Best-effort — a failed send must not abort the DB
 * transition. entity_id = the partner_users id. A rejected application has no
 * partner row, so partnerId is null there (idempotency rests on the guarded
 * reject action, which fires once).
 */
async function sendOutcomeEmail(params: {
  admin: SupabaseClient;
  outcome: ApplicationOutcome;
  to: string;
  partnerUserId: string;
  partnerId: string | null;
}): Promise<void> {
  try {
    const rendered = renderApplicationOutcomeEmail(params.outcome, {
      partnerSignInUrl: `${getSiteOrigin()}/partner`,
      supportEmail: SUPPORT_EMAIL,
    });
    await dispatchPartnerEmail(params.admin, {
      partnerId: params.partnerId,
      template: `application_${params.outcome}`,
      entityId: params.partnerUserId,
      to: params.to,
      subject: rendered.subject,
      text: rendered.text,
      html: renderEmailShell({ bodyHtml: rendered.html }),
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
 * (type='partner', visible=false — Staff flip visibility separately), link it,
 * mark approved, email the applicant. Idempotent: an already-linked row is a
 * no-op (never creates a second partners row).
 */
export async function approveApplication(id: string): Promise<{ ok: true }> {
  const actor = await assertAdmin(PERM);
  const admin = supabaseAdmin();

  const { data: row, error } = await admin
    .from("partner_users")
    .select("id, email, partner_id, application_status, questionnaire")
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

  // Create the partners (Location) row unless one is already linked.
  let partnerId = row.partner_id as string | null;
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
        website_url: q.website ?? null,
        type: "partner",
        visible: false, // Staff flip visibility via Locations CRUD; approval never publishes.
        position: nextPosition,
        address: q.address ?? null,
        postal_code: q.postal_code ?? null,
      })
      .select("id")
      .single();
    if (partnerError) throw new Error(partnerError.message);
    partnerId = partner.id as string;
  }

  const { error: updateError } = await admin
    .from("partner_users")
    .update({ partner_id: partnerId, application_status: "approved" })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

  await recordAdminAction({
    actor,
    action: "partner_application.approve",
    entityType: "partner_user",
    entityId: id,
    before: { application_status: status, partner_id: row.partner_id },
    after: { application_status: "approved", partner_id: partnerId },
  });

  await sendOutcomeEmail({
    admin,
    outcome: "approved",
    to: row.email,
    partnerUserId: id,
    partnerId,
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

  const { error: updateError } = await admin
    .from("partner_users")
    .update({ application_status: "rejected" })
    .eq("id", id);
  if (updateError) throw new Error(updateError.message);

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
