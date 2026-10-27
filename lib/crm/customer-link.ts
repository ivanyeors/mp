import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLikePattern } from "@/lib/supabase/like-pattern";
import { normaliseResultEmail } from "@/lib/results/owner";

/**
 * Which Customer a Result belongs to, for the Admin Panel's *Open customer*
 * link (PRD-crm-retention-loop slice 02).
 *
 * The Result's `customer_id` when that Customer still exists; otherwise the
 * Customer whose email is the Result's, ignoring case and surrounding
 * whitespace, as `lib/results/owner.ts` compares them. `customers.email` is
 * unique on `lower(email)`, so the email names at most one; anything but
 * exactly one row links nothing rather than a guess. A failed read links
 * nothing too: the link is a convenience, never a reason to fail the page.
 */
export async function customerIdForResult(
  admin: SupabaseClient,
  row: { customer_id?: string | null; customer_email?: string | null },
): Promise<string | null> {
  if (row.customer_id) {
    const { data, error } = await admin.from("customers").select("id").eq("id", row.customer_id).maybeSingle();
    if (!error && data) return (data as { id: string }).id;
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
