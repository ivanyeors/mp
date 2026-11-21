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
    console.error("[journey] Could not read the session before a Visitor merge:", e);
    return;
  }
  await stitchVisitor(db, req, person);
}
