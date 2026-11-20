import { supabaseAdmin } from "@/lib/supabase/server";

export async function getSiteSettings(
  keys: string[]
): Promise<Record<string, string>> {
  if (keys.length === 0) return {};

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", keys);

  if (error) {
    console.error("[getSiteSettings]", error.message);
    return {};
  }

  const result: Record<string, string> = {};
  for (const row of data ?? []) {
    result[row.key] = row.value;
  }
  return result;
}
