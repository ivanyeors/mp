/**
 * Partner WhatsApp notifications (#86). An ADDITIVE channel over the branded
 * partner emails (#84): the same four events — referral earned, milestone
 * reached, payout made, terms re-accept — also reach opted-in partners on
 * WhatsApp, using the application mobile number and the shared Cloud API client.
 *
 * WhatsApp is best-effort and NEVER the source of truth. Every "no" (transport
 * unconfigured, template not approved yet, partner opted out, bad mobile,
 * duplicate) is a silent skip — email already covers the partner, so a WhatsApp
 * fault must never surface to the partner or break the money path it rides on.
 *
 * Idempotent at-most-once per (partner_id, template, entity_id) via the
 * partner_whatsapp ledger, mirroring dispatchPartnerEmail's claim on partner_emails.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPhoneAllowed, normalizePhone } from "@/lib/appointments/phone";
import { sendTemplateMessage } from "@/lib/appointments/whatsapp";

/** The four partner events, keyed identically to the email templates (#84). */
export type PartnerWaTemplate =
  | "referral_earned"
  | "milestone_reached"
  | "payout_made"
  | "reaccept_terms";

/**
 * Meta-approved template name per event, read from env. Owner-approved copy is a
 * HITL step (Meta submission + approval); until the env var is set the send is a
 * silent skip and the partner still gets the email.
 */
const TEMPLATE_ENV: Record<PartnerWaTemplate, string> = {
  referral_earned: "WHATSAPP_TEMPLATE_PARTNER_REFERRAL",
  milestone_reached: "WHATSAPP_TEMPLATE_PARTNER_MILESTONE",
  payout_made: "WHATSAPP_TEMPLATE_PARTNER_PAYOUT",
  reaccept_terms: "WHATSAPP_TEMPLATE_PARTNER_REACCEPT",
};

export type WaDecision =
  | { ok: true; e164: string; templateName: string }
  | { ok: false; skip: string };

/**
 * Pure send/skip decision — no IO, unit-testable. Order matters: cheapest and
 * most-common skips first. Every branch is a silent skip, not an error, because
 * email is the always-on channel.
 */
export function decidePartnerWa(input: {
  transportConfigured: boolean;
  templateName: string | null | undefined;
  notifyWhatsapp: boolean | null | undefined;
  contactMobile: string | null | undefined;
}): WaDecision {
  if (!input.transportConfigured) return { ok: false, skip: "transport_unconfigured" };
  if (!input.templateName) return { ok: false, skip: "template_unconfigured" };
  if (!input.notifyWhatsapp) return { ok: false, skip: "opted_out" };
  const e164 = normalizePhone(input.contactMobile ?? null);
  if (!e164) return { ok: false, skip: "no_phone" };
  return { ok: true, e164, templateName: input.templateName };
}

function transportConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_TOKEN?.trim(),
  );
}

/**
 * Fire the additive WhatsApp notification for a partner event. Best-effort and
 * idempotent — resolves (never rejects), so callers can `await` it after the
 * email without any try/catch. `bodyParams` are the ordered text params for the
 * approved template; keep them non-empty (Meta rejects empty template params).
 */
export async function notifyPartnerWhatsApp(
  admin: SupabaseClient,
  input: {
    partnerId: string;
    template: PartnerWaTemplate;
    entityId: string;
    bodyParams: string[];
  },
): Promise<{ sent: boolean; skip?: string; error?: string }> {
  try {
    // Opt-in is per-PARTNER (on the partners aggregate). The mobile is the
    // application mobile from the approved partner_users row — approved row wins,
    // matching partnerRecipientEmail (a partner may have >1 partner_users row).
    const [pref, puList] = await Promise.all([
      admin.from("partners").select("notify_whatsapp").eq("id", input.partnerId).maybeSingle(),
      admin
        .from("partner_users")
        .select("questionnaire")
        .eq("partner_id", input.partnerId)
        .order("application_status", { ascending: true }) // 'approved' before 'pending'/'rejected'
        .limit(1),
    ]);
    const notifyWhatsapp = (pref.data as { notify_whatsapp?: boolean } | null)?.notify_whatsapp;
    const questionnaire = ((puList.data ?? [])[0] as { questionnaire?: { contactMobile?: string } } | undefined)
      ?.questionnaire;

    const decision = decidePartnerWa({
      transportConfigured: transportConfigured(),
      templateName: process.env[TEMPLATE_ENV[input.template]]?.trim() || null,
      notifyWhatsapp,
      contactMobile: questionnaire?.contactMobile,
    });
    if (!decision.ok) return { sent: false, skip: decision.skip };

    // Non-prod allowlist — same safety gate the appointment cron honors, so a
    // preview/local run with transport+template set can't message real partners.
    if (!isPhoneAllowed(decision.e164)) return { sent: false, skip: "not_allowlisted" };

    // Idempotent claim — ignoreDuplicates ⇒ [] on conflict ⇒ already sent, skip.
    const { data: claim, error: claimErr } = await admin
      .from("partner_whatsapp")
      .upsert(
        {
          partner_id: input.partnerId,
          template: input.template,
          entity_id: input.entityId,
          recipient: decision.e164,
          status: "pending",
        },
        { onConflict: "partner_id,template,entity_id", ignoreDuplicates: true },
      )
      .select("id");
    if (claimErr) return { sent: false, error: claimErr.message };
    if (!claim || claim.length === 0) return { sent: false, skip: "duplicate" };
    const claimId = claim[0].id as string;

    try {
      const id = await sendTemplateMessage(decision.e164, decision.templateName, input.bodyParams);
      await admin
        .from("partner_whatsapp")
        .update({
          status: "sent",
          provider_message_id: id ?? null,
          dispatched_at: new Date().toISOString(),
        })
        .eq("id", claimId);
      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await admin
        .from("partner_whatsapp")
        .update({ status: "failed", error: message })
        .eq("id", claimId);
      return { sent: false, error: message };
    }
  } catch (err) {
    // Silent fallback to email-only — a WhatsApp fault is never partner-visible.
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
