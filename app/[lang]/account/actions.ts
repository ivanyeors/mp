"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";
import { normalizePhone } from "@/lib/appointments/phone";
import { readProfileAftercare, setAftercarePreference } from "@/lib/aftercare/preferences";
import {
  AFTERCARE_PREFERENCES,
  aftercareWhatsAppWording,
  mobileForWording,
} from "@/lib/aftercare/state";
import { readMarketingEmailState, setMarketingEmail } from "@/lib/marketing-consent/consent";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";
import { UnsubscribeAnswerSchema, recordUnsubscribeReason } from "@/lib/marketing-consent/unsubscribe-reasons-server";

export type AftercareActionResult =
  | { ok: true; email: boolean; whatsapp: boolean; phone: string | null }
  | { ok: false; error: string; needsMobile?: boolean };

const InputSchema = z.object({
  preference: z.enum(AFTERCARE_PREFERENCES),
  value: z.boolean(),
  mobile: z.string().trim().max(40).optional(),
});

export async function setMyAftercarePreference(input: unknown): Promise<AftercareActionResult> {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid change" };
  const { preference, value, mobile } = parsed.data;

  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false, error: "You must be signed in." };

  const admin = supabaseAdmin();
  const current = await readProfileAftercare(admin, customerId);
  if (!current) return { ok: false, error: "You must be signed in." };

  let wording: string | null = null;
  if (preference === "aftercare_whatsapp" && value) {
    let e164 = normalizePhone(current.phone);
    if (!e164) {
      e164 = normalizePhone(mobile ?? null);
      if (!e164) {
        return { ok: false, needsMobile: true, error: "Enter a mobile number WhatsApp can reach." };
      }
      const { error } = await admin.from("customers").update({ phone: e164 }).eq("id", customerId);
      if (error) return { ok: false, error: "Could not save your mobile number." };
    }
    wording = aftercareWhatsAppWording(mobileForWording(e164));
  }

  const result = await setAftercarePreference(admin, {
    customerId,
    preference,
    value,
    source: "profile",
    wording,
  });
  if (!result.ok) return { ok: false, error: "Could not save that change. Please try again." };

  const after = await readProfileAftercare(admin, customerId);
  revalidatePath("/[lang]/account", "page");
  return {
    ok: true,
    email: after?.email ?? current.email,
    whatsapp: after?.whatsapp ?? current.whatsapp,
    phone: after?.phone ?? current.phone,
  };
}

export type MarketingEmailActionResult =
  | { ok: true; state: MarketingEmailState }
  | { ok: false; error: string };

const MarketingEmailSchema = z.object({ subscribed: z.boolean() });

export async function setMyMarketingEmail(input: unknown): Promise<MarketingEmailActionResult> {
  const parsed = MarketingEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid change" };

  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false, error: "You must be signed in." };

  const admin = supabaseAdmin();
  const to = parsed.data.subscribed ? "subscribed" : "unsubscribed";
  const result = await setMarketingEmail(admin, { customerId, to, source: "account" });
  if (!result.ok) return { ok: false, error: "Could not save that change. Please try again." };

  const state = await readMarketingEmailState(admin, customerId).catch(() => null);
  revalidatePath("/[lang]/account", "page");
  return { ok: true, state: state ?? to };
}

export async function answerMyUnsubscribeReason(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UnsubscribeAnswerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose one of the answers." };
  const customerId = await getCurrentCustomerId();
  if (!customerId) return { ok: false, error: "You must be signed in." };
  try {
    await recordUnsubscribeReason(supabaseAdmin(), customerId, parsed.data);
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not send that. Please try again." };
  }
}
