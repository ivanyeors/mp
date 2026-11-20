import type { SupabaseClient } from "@supabase/supabase-js";
import { isPhoneAllowed, normalizePhone } from "@/lib/appointments/phone";
import { sendTemplateMessage, WhatsAppSendError } from "@/lib/appointments/whatsapp";
import { readWhatsAppGate, WHATSAPP_MARKETING_OFF } from "@/lib/aftercare/preferences";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  AFTERCARE_CHECKUP_TEMPLATE,
  AFTERCARE_REVIEW_TEMPLATE,
  type AftercareTemplateDef,
} from "./aftercare-templates";

export { WHATSAPP_MARKETING_OFF };

export type AftercareWaTemplate = "aftercare.review_request" | `aftercare.checkup_${number}m`;

export function templateDefFor(template: AftercareWaTemplate): AftercareTemplateDef {
  return template === "aftercare.review_request" ? AFTERCARE_REVIEW_TEMPLATE : AFTERCARE_CHECKUP_TEMPLATE;
}

export function aftercareTemplateName(
  template: AftercareWaTemplate,
  env: Record<string, string | undefined> = process.env,
): string | null {
  return env[templateDefFor(template).env]?.trim() || null;
}

export type AftercareWaSkip =
  | "template_unconfigured"
  | "opted_out"
  | "stop_requested"
  | "no_mobile"
  | "invalid_mobile"
  | "not_allowed_outside_production";

export type AftercareWaDecision =
  | { send: true; e164: string; templateName: string }
  | { send: false; skip: AftercareWaSkip };

export function decideAftercareWhatsApp(input: {
  templateName: string | null | undefined;
  optedIn: boolean | null | undefined;
  stopRequested: boolean;
  phone: string | null | undefined;
  nonProdAllowed: (e164: string) => boolean;
}): AftercareWaDecision {
  const templateName = input.templateName?.trim();
  if (!templateName) return { send: false, skip: "template_unconfigured" };
  if (input.optedIn !== true) return { send: false, skip: "opted_out" };
  if (input.stopRequested) return { send: false, skip: "stop_requested" };
  if (!input.phone?.trim()) return { send: false, skip: "no_mobile" };
  const e164 = normalizePhone(input.phone);
  if (!e164) return { send: false, skip: "invalid_mobile" };
  if (!input.nonProdAllowed(e164)) return { send: false, skip: "not_allowed_outside_production" };
  return { send: true, e164, templateName };
}

const MARKETING_OFF_CODE = 131050;

export function aftercareSendError(err: unknown): string {
  if (err instanceof WhatsAppSendError && err.code === MARKETING_OFF_CODE) return WHATSAPP_MARKETING_OFF;
  const message = err instanceof Error ? err.message : String(err);
  if (/\b131050\b/.test(message)) return WHATSAPP_MARKETING_OFF;
  return message.slice(0, 1000);
}

export function aftercareWhatsAppTransportConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() && process.env.WHATSAPP_TOKEN?.trim());
}

export type AftercareWaResult =
  | { sent: true }
  | { sent: false; skip: AftercareWaSkip | "transport_unconfigured" | "no_customer" | "duplicate" }
  | { sent: false; error: string };

export async function notifyAftercareWhatsApp(
  admin: SupabaseClient,
  input: {
    customerId: string;
    template: AftercareWaTemplate;
    entityId: string;
    bodyParams: string[];
    urlButtonParam: string;
  },
): Promise<AftercareWaResult> {
  try {
    if (!aftercareWhatsAppTransportConfigured()) return { sent: false, skip: "transport_unconfigured" };
    const gate = await readWhatsAppGate(admin, input.customerId);
    if (!gate) return { sent: false, skip: "no_customer" };

    const decision = decideAftercareWhatsApp({
      templateName: aftercareTemplateName(input.template),
      optedIn: gate.optedIn,
      stopRequested: gate.stopRequested,
      phone: gate.phone,
      nonProdAllowed: (e164) => isPhoneAllowed(e164),
    });
    if (!decision.send) return { sent: false, skip: decision.skip };

    const { data: claim, error: claimErr } = await admin
      .from("customer_whatsapp")
      .upsert(
        {
          customer_id: input.customerId,
          template: input.template,
          entity_id: input.entityId,
          phone: decision.e164,
          status: "pending",
        },
        { onConflict: "customer_id,template,entity_id", ignoreDuplicates: true },
      )
      .select("id");
    if (claimErr) return { sent: false, error: claimErr.message };
    if (!claim || claim.length === 0) return { sent: false, skip: "duplicate" };
    const claimId = claim[0].id as number | string;

    try {
      const waId = await sendTemplateMessage(decision.e164, decision.templateName, input.bodyParams, {
        urlButtonParam: input.urlButtonParam,
      });
      await admin
        .from("customer_whatsapp")
        .update({ status: "sent", wa_id: waId ?? null, sent_at: new Date().toISOString(), last_error: null })
        .eq("id", claimId);
      return { sent: true };
    } catch (err) {
      const lastError = aftercareSendError(err);
      await admin.from("customer_whatsapp").update({ status: "failed", last_error: lastError }).eq("id", claimId);
      return { sent: false, error: lastError };
    }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function latestAftercareSentAt(
  e164: string,
  admin: SupabaseClient = supabaseAdmin(),
): Promise<string | null> {
  const { data, error } = await admin
    .from("customer_whatsapp")
    .select("sent_at")
    .eq("phone", e164)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.sent_at as string | undefined) ?? null;
}

export async function recordAftercareDeliveryFailure(
  waId: string,
  reason: string,
  admin: SupabaseClient = supabaseAdmin(),
): Promise<number> {
  const { data, error } = await admin
    .from("customer_whatsapp")
    .update({ status: "failed", last_error: aftercareSendError(new Error(reason)) })
    .eq("wa_id", waId)
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}
