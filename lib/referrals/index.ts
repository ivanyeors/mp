import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  PARTNER_TERMS_COLUMNS,
  partnerTermsOf,
  type PartnerTerms,
  type PartnerTermsRow,
} from "@/lib/partner-terms";
import {
  generateReferralCode,
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "./attribution";

export type ReferralPartner = {
  id: string;
  name: string;
  referral_code: string | null;
  terms: PartnerTerms;
};

export async function getPartnerByReferralCode(
  code: string,
): Promise<ReferralPartner | null> {
  const normalized = normalizeReferralCode(code);
  if (!isValidReferralCodeFormat(normalized)) return null;
  const { data, error } = await supabaseAdmin()
    .from("partners")
    .select(`id, name, referral_code, ${PARTNER_TERMS_COLUMNS}`)
    .eq("type", "partner")
    .ilike("referral_code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as { id: string; name: string; referral_code: string | null } & PartnerTermsRow;
  return { id: row.id, name: row.name, referral_code: row.referral_code, terms: partnerTermsOf(row) };
}

export async function isSelfReferral(
  partnerId: string,
  buyer: { sessionPartnerId?: string | null; email?: string | null },
): Promise<boolean> {
  if (buyer.sessionPartnerId && buyer.sessionPartnerId === partnerId) return true;
  const email = (buyer.email ?? "").trim().toLowerCase();
  if (!email) return false;
  const { data, error } = await supabaseAdmin()
    .from("partner_users")
    .select("email, backup_email, backup_email_verified")
    .eq("partner_id", partnerId);
  if (error) {
    console.error(`[referrals] Could not check self-referral for partner ${partnerId}:`, error.message);
    return true;
  }
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  return (data ?? []).some(
    (u) => norm(u.email) === email || (u.backup_email_verified === true && norm(u.backup_email) === email),
  );
}

export type PartnerAssistContext = {
  partnerId: string;
  code: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
};

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
    if (await isCouponCode(admin, code)) continue;
    const { data, error: updErr } = await admin
      .from("partners")
      .update({ referral_code: code })
      .eq("id", partnerId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();
    if (!updErr && data?.referral_code) return data.referral_code as string;
    const { data: now } = await admin
      .from("partners")
      .select("referral_code")
      .eq("id", partnerId)
      .maybeSingle();
    if (now?.referral_code) return now.referral_code as string;
  }
  return null;
}

export async function isReferralCodeTaken(code: string): Promise<boolean> {
  const normalized = normalizeReferralCode(code);
  if (!isValidReferralCodeFormat(normalized)) return false;
  const { data } = await supabaseAdmin()
    .from("partners")
    .select("id")
    .ilike("referral_code", normalized)
    .limit(1);
  return (data ?? []).length > 0;
}

async function isCouponCode(admin: SupabaseClient, code: string): Promise<boolean> {
  const { data } = await admin.from("coupons").select("id").eq("code", code.toUpperCase()).limit(1);
  return (data ?? []).length > 0;
}

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
