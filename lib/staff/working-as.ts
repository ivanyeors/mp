import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";

export const WORKING_AS_COOKIE = "mp_working_as";

export const WORKING_AS_MAX_AGE = 60 * 60 * 24 * 365;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WorkingAsProfile = { id: string; name: string };

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

export async function getWorkingAs(memberId: string): Promise<WorkingAsProfile | null> {
  let value: string | undefined;
  try {
    value = (await cookies()).get(WORKING_AS_COOKIE)?.value;
  } catch {
    return null;
  }
  return validWorkingAs(memberId, value);
}

export async function actingProfile(memberId: string): Promise<WorkingAsProfile | null> {
  const chosen = await getWorkingAs(memberId);
  if (chosen) return chosen;
  const profiles = await memberProfiles(memberId);
  return profiles.length === 1 ? { id: profiles[0]!.id, name: profiles[0]!.name } : null;
}
