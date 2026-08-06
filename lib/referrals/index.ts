/**
 * Referral data layer (server — uses `supabaseAdmin`). Pure helpers live in
 * ./attribution (kept import-free of server code for slice #85 tests).
 *
 * "Active partner" = a `partners` row with `type='partner'`. Codes are only ever
 * generated for approved partners via the hub (`ensureReferralCode`), so a
 * non-null `referral_code` on a partner-type row implies an approved partner.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  generateReferralCode,
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "./attribution";

export type ReferralPartner = { id: string; name: string; referral_code: string | null };

/** Active partner clinic for a referral code, or null. Case-insensitive. */
export async function getPartnerByReferralCode(
  code: string,
): Promise<ReferralPartner | null> {
  const normalized = normalizeReferralCode(code);
  if (!isValidReferralCodeFormat(normalized)) return null;
  const { data, error } = await supabaseAdmin()
    .from("partners")
    .select("id, name, referral_code")
    .eq("type", "partner")
    .ilike("referral_code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return data as ReferralPartner;
}

/** Co-brand + assist context for a partner-assisted configurator run (#78). */
export type PartnerAssistContext = {
  partnerId: string;
  code: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
};

/**
 * Active partner (co-brand fields) for a referral code, or null. Used by the
 * partner-assisted configurator to render the co-brand finish panel and to
 * re-resolve the assist partner server-side at hold (never trust a client id).
 */
export async function getPartnerByCode(
  code: string,
): Promise<PartnerAssistContext | null> {
  const normalized = normalizeReferralCode(code);
  if (!isValidReferralCodeFormat(normalized)) return null;
  const { data, error } = await supabaseAdmin()
    .from("partners")
    .select("id, name, logo_url, description, referral_code")
    .eq("type", "partner")
    .ilike("referral_code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return {
    partnerId: data.id as string,
    code: (data.referral_code as string | null) ?? normalized,
    name: data.name as string,
    logoUrl: (data.logo_url as string | null) ?? null,
    description: (data.description as string | null) ?? null,
  };
}

/**
 * Returns the partner's referral code, generating + persisting a unique one on
 * first use. Retries on the unique-index collision (case-insensitive).
 */
export async function ensureReferralCode(partnerId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: existing, error } = await admin
    .from("partners")
    .select("referral_code")
    .eq("id", partnerId)
    .maybeSingle();
  if (error || !existing) return null;
  if (existing.referral_code) return existing.referral_code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { data, error: updErr } = await admin
      .from("partners")
      .update({ referral_code: code })
      .eq("id", partnerId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();
    if (!updErr && data?.referral_code) return data.referral_code as string;
    // Unique collision or a concurrent writer won the race — re-read and retry.
    const { data: now } = await admin
      .from("partners")
      .select("referral_code")
      .eq("id", partnerId)
      .maybeSingle();
    if (now?.referral_code) return now.referral_code as string;
  }
  return null;
}

/** Inline-validation result for the contact field + checkout. */
export async function validateReferralCode(
  code: string,
): Promise<{ valid: boolean; partnerId: string | null; partnerName: string | null }> {
  const partner = await getPartnerByReferralCode(code);
  if (!partner) return { valid: false, partnerId: null, partnerName: null };
  return { valid: true, partnerId: partner.id, partnerName: partner.name };
}

/** Last-touch: overwrite the Visitor's ref stamp with the newest code + now. */
export async function stampVisitorRef(
  db: SupabaseClient,
  visitorId: string,
  code: string,
): Promise<void> {
  await db.from("analytics_visitors").upsert(
    { id: visitorId, ref_code: normalizeReferralCode(code), ref_stamped_at: new Date().toISOString() },
    { onConflict: "id" },
  );
}
