import { supabaseAdmin } from "@/lib/supabase/server";

export type StaffRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

/**
 * Manufacturing staff, alphabetical — the shape `/api/staff` returns and the
 * settings pages render. Throws on a Supabase error so callers can map it to a
 * status code.
 */
export async function listStaffRows(): Promise<StaffRow[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("mp_staff")
    .select("id,name,created_at,updated_at")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as StaffRow[];
}
