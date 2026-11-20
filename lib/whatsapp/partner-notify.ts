import type { SupabaseClient } from "@supabase/supabase-js";
import { isPhoneAllowed, normalizePhone } from "@/lib/appointments/phone";
import { sendTemplateMessage } from "@/lib/appointments/whatsapp";

export type PartnerWaTemplate =
  | "referral_earned"
  | "milestone_reached"
  | "payout_made"
  | "reaccept_terms";

const TEMPLATE_ENV: Record<PartnerWaTemplate, string> = {
  referral_earned: "WHATSAPP_TEMPLATE_PARTNER_REFERRAL",
  milestone_reached: "WHATSAPP_TEMPLATE_PARTNER_MILESTONE",
  payout_made: "WHATSAPP_TEMPLATE_PARTNER_PAYOUT",
  reaccept_terms: "WHATSAPP_TEMPLATE_PARTNER_REACCEPT",
};

export type WaDecision =
  | { ok: true; e164: string; templateName: string }
  | { ok: false; skip: string };

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
    const [pref, puList] = await Promise.all([
      admin.from("partners").select("notify_whatsapp").eq("id", input.partnerId).maybeSingle(),
      admin
        .from("partner_users")
        .select("questionnaire")
        .eq("partner_id", input.partnerId)
        .order("application_status", { ascending: true })
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

    if (!isPhoneAllowed(decision.e164)) return { sent: false, skip: "not_allowlisted" };

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
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
