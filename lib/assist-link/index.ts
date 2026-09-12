/**
 * Assist link data layer (server — uses `supabaseAdmin`).
 *
 * An **Assist link** is one reusable per-**Staff** code, `/mp-config?assist=<code>`.
 * The customer holding it has no `admin_users` row, so it grants no Admin Panel
 * access and no **Staff assist mode** whatsoever — it only stamps the **Draft
 * Result** they create with `source = 'staff_assisted'` and the resolving Staff
 * id. That stamp authorises the no-card submit downstream, which makes it a
 * trust boundary: the code is always re-resolved server-side and a Staff id is
 * never accepted from a client.
 *
 * Format and generation are shared with the partner **Referral** code — same
 * alphabet, same 6–12 uppercase-alphanumeric shape — so a human reading a code
 * aloud has one thing to reason about, not two.
 */
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  generateReferralCode,
  isValidReferralCodeFormat,
  normalizeReferralCode,
} from "@/lib/referrals/attribution";

export type AssistStaff = { staffId: string; code: string };

/**
 * Active Staff for an Assist link code, or null. Case-insensitive, and never
 * throws: an unknown, malformed or deactivated code resolves to null and the
 * configurator behaves as if no code were present, because a link that
 * silently degrades to the normal flow beats an error page for a customer who
 * did nothing wrong.
 */
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

/**
 * The Staff member's Assist link code, minting and persisting a unique one on
 * first request (never backfilled). Copy of `ensureReferralCode`'s retry loop:
 * each write is guarded by `.is("assist_code", null)` so a concurrent writer
 * loses the race rather than overwriting it, and a lost race re-reads the
 * winner's code instead of minting a second one — two simultaneous first
 * requests therefore return the same code.
 */
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
    // Unique collision, or a concurrent writer won the race — re-read and retry.
    const { data: now } = await admin
      .from("admin_users")
      .select("assist_code")
      .eq("id", adminUserId)
      .maybeSingle();
    if (now?.assist_code) return now.assist_code as string;
  }
  return null;
}

/**
 * The caller's own `admin_users.id` from their auth user id. `AdminContext`
 * carries the auth id, not the staff row id, and this is the only place that
 * gap matters. Reliable after `getAdminContext()` has run: it links
 * `auth_user_id` on the first email match and sets it on the bootstrap insert.
 *
 * Only ever call this with the SIGNED-IN user's id — it is what keeps a Staff
 * member minting their own code and nobody else's.
 */
export async function adminUserIdForAuthUser(authUserId: string): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from("admin_users")
    .select("id")
    .eq("auth_user_id", authUserId)
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
