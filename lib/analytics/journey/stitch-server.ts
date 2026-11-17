/**
 * `stitchVisitor` for a route a shopper, Staff or a Partner can all reach.
 *
 * A signed-in Staff member or Partner is serving someone else on their own
 * device: a showroom tablet takes many shoppers' emails through one Visitor
 * cookie. Tying that cookie to the first of them would hand that Customer
 * every later shopper's Visits, so those sessions are left unlinked.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/auth/admin";
import { getPartnerContext } from "@/lib/auth/partner";
import { stitchVisitor } from "./identity";

export async function stitchShopperVisitor(
  db: SupabaseClient,
  req: { headers: { get(name: string): string | null } },
  person: { email?: string | null; customerId?: string | null },
): Promise<void> {
  try {
    if (await getAdminContext()) return;
    if (await getPartnerContext()) return;
  } catch (e) {
    // Not knowing who is signed in is not a reason to link: leave it.
    console.error("[journey] Could not read the session before a Visitor merge:", e);
    return;
  }
  await stitchVisitor(db, req, person);
}
