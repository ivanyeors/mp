import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * "Working as" (PRD users-permissions-rbac slice 10): on a shared login, the
 * Staff profile the person at the device says they are. Kept in an httpOnly
 * cookie and re-validated on every read against the signed-in Member — a
 * cookie naming another login's profile, an archived profile or garbage is
 * ignored. Attribution, never authorisation: nothing here feeds a guard.
 */

export const WORKING_AS_COOKIE = "mp_working_as";

/** One year: it is a device preference, not a session. */
export const WORKING_AS_MAX_AGE = 60 * 60 * 24 * 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkingAsProfile = { id: string; name: string };

/** The Member's live profiles, by name. */
export async function memberProfiles(memberId: string): Promise<WorkingAsProfile[]> {
  const { data, error } = await supabaseAdmin()
    .from("mp_staff")
    .select("id,name")
    .eq("admin_user_id", memberId)
    .is("archived_at", null)
    .order("name", { ascending: true });
  if (error) return [];
  return (data ?? []) as WorkingAsProfile[];
}

/**
 * The profile `value` names, if it is one of `memberId`'s live profiles.
 * Pure of request state, so it is the one check every caller shares.
 */
export async function validWorkingAs(memberId: string, value: string | null | undefined): Promise<WorkingAsProfile | null> {
  if (!value || !UUID.test(value)) return null;
  const { data, error } = await supabaseAdmin()
    .from("mp_staff")
    .select("id,name,admin_user_id,archived_at")
    .eq("id", value)
    .maybeSingle();
  if (error || !data || data.admin_user_id !== memberId || data.archived_at) return null;
  return { id: data.id as string, name: data.name as string };
}

/** The signed-in Member's working-as profile from the request cookie, or null. */
export async function getWorkingAs(memberId: string): Promise<WorkingAsProfile | null> {
  let value: string | undefined;
  try {
    value = (await cookies()).get(WORKING_AS_COOKIE)?.value;
  } catch {
    // Outside a request (cron, scripts): nobody is at a device.
    return null;
  }
  return validWorkingAs(memberId, value);
}
