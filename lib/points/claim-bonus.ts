import type { SupabaseClient } from "@supabase/supabase-js";
import { readPointsSettings } from "./server";

export type ClaimBonusView =
  | { kind: "granted"; points: number }
  | { kind: "closed"; endedOn: string };

export async function readClaimBonusView(admin: SupabaseClient, customerId: string): Promise<ClaimBonusView | null> {
  try {
    const settings = await readPointsSettings(admin);
    if (!settings.enabled) return null;
    const [bonus, migrated, end] = await Promise.all([
      admin.from("points_ledger").select("points").eq("customer_id", customerId).eq("kind", "claim_bonus").maybeSingle(),
      admin.from("migrated_customers").select("claimed_at").eq("customer_id", customerId).maybeSingle(),
      admin.rpc("claim_bonus_window_end", { p_customer_id: customerId }),
    ]);
    if (bonus.error || migrated.error || end.error) return null;
    if (bonus.data) return { kind: "granted", points: Number((bonus.data as { points: number }).points) };
    const claimedAt = (migrated.data as { claimed_at: string | null } | null)?.claimed_at;
    const endAt = typeof end.data === "string" ? end.data : null;
    if (claimedAt && endAt && Date.parse(claimedAt) > Date.parse(endAt)) return { kind: "closed", endedOn: endAt };
    return null;
  } catch {
    return null;
  }
}
