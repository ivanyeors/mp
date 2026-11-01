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

/**
 * The customer's own Aftercare switches, in their Profile (PRD customer-crm
 * slice 13). The only place a customer changes them: there is no unsubscribe
 * link, no WhatsApp keyword and no checkout checkbox.
 *
 * The Customer comes from the session, never from the request, so a body
 * naming someone else's id changes nothing but the caller's own row.
 */

export type AftercareActionResult =
  | { ok: true; email: boolean; whatsapp: boolean; phone: string | null }
  | { ok: false; error: string; needsMobile?: boolean };

const InputSchema = z.object({
  preference: z.enum(AFTERCARE_PREFERENCES),
  value: z.boolean(),
  /** Asked for only when turning WhatsApp on with no valid mobile on file. */
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
    // A mobile is needed. One on file that is valid is used as it is; otherwise
    // the number typed here is saved first, normalised, as the Profile's first
    // editable field.
    let e164 = normalizePhone(current.phone);
    if (!e164) {
      e164 = normalizePhone(mobile ?? null);
      if (!e164) {
        return { ok: false, needsMobile: true, error: "Enter a mobile number WhatsApp can reach." };
      }
      const { error } = await admin.from("customers").update({ phone: e164 }).eq("id", customerId);
      if (error) return { ok: false, error: "Could not save your mobile number." };
    }
    // The exact text the toggle showed, with this number in it: the evidence.
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

// ─── Marketing consent (migration slice 07) ─────────────────────────────────

export type MarketingEmailActionResult =
  | { ok: true; state: MarketingEmailState }
  | { ok: false; error: string };

const MarketingEmailSchema = z.object({ subscribed: z.boolean() });

/**
 * The Profile's "Email me news and offers" toggle: the platform's first
 * first-party consent capture, source `account`. It is the one way an
 * `unsubscribed` Customer subscribes again. Off is `unsubscribed`, never
 * `not_subscribed`: a "no" given here is a choice, not "never asked".
 *
 * The Customer comes from the session, never from the request.
 */
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

/**
 * *Mind telling us why?* after the toggle is turned off (PRD-crm-retention-loop
 * slice 11): one optional answer for the signed-in Customer's latest
 * unsubscribe. It never changes consent; the toggle did that already. With
 * nothing to answer (subscribed again since, or already answered) it is still
 * a thank-you, not an error.
 */
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
