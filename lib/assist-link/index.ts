import { supabaseAdmin } from "@/lib/supabase/server";
import {
  generateReferralCode,
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "@/lib/referrals/attribution";

export type AssistStaff = { staffId: string; code: string };

export async function getStaffByAssistCode(code: string): Promise<AssistStaff | null> {
  const normalized = normalizeReferralCode(code);
  if (!isValidReferralCodeFormat(normalized)) return null;
  const { data, error } = await supabaseAdmin()
    .from("admin_users")
    .select("id, assist_code, is_active")
    .eq("is_active", true)
    .ilike("assist_code", normalized)
    .maybeSingle();
  if (error || !data) return null;
  return {
    staffId: data.id as string,
    code: (data.assist_code as string | null) ?? normalized,
  };
}

export async function ensureAssistCode(adminUserId: string): Promise<string | null> {
  const admin = supabaseAdmin();
  const { data: existing, error } = await admin
    .from("admin_users")
    .select("assist_code")
    .eq("id", adminUserId)
    .maybeSingle();
  if (error || !existing) return null;
  if (existing.assist_code) return existing.assist_code as string;

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { data, error: updErr } = await admin
      .from("admin_users")
      .update({ assist_code: code })
      .eq("id", adminUserId)
      .is("assist_code", null)
      .select("assist_code")
      .maybeSingle();
    if (!updErr && data?.assist_code) return data.assist_code as string;
    const { data: now } = await admin
      .from("admin_users")
      .select("assist_code")
      .eq("id", adminUserId)
      .maybeSingle();
    if (now?.assist_code) return now.assist_code as string;
  }
  return null;
}

export async function adminUserIdForAuthUser(authUserId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
