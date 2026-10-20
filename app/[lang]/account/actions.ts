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
