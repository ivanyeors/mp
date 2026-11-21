import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLikePattern } from "@/lib/supabase/like-pattern";
import { normaliseResultEmail } from "@/lib/results/owner";

export async function customerIdForResult(
  admin: SupabaseClient,
  row: { customer_id?: string | null; customer_email?: string | null },
): Promise<string | null> {
  if (row.customer_id) {
    const { data, error } = await admin.from("customers").select("id").eq("id", row.customer_id).maybeSingle();
    if (error) return null;
    if (data) return (data as { id: string }).id;
  }
  const email = normaliseResultEmail(row.customer_email);
  if (!email) return null;
  const { data, error } = await admin
    .from("customers")
    .select("id")
    .ilike("email", escapeLikePattern(email))
    .limit(2);
  if (error || !data || data.length !== 1) return null;
  return (data[0] as { id: string }).id;
}
