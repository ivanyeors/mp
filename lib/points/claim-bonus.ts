/**
 * What a signed-in Migrated customer is told about their Claim bonus
 * (PRD-loyalty-points slice 05; ADR 0030 f, g), on the welcome page. Never a
 * promise the Claim will not keep: granted, closed, or nothing at all.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPointsSettings } from "./server";

export type ClaimBonusView =
  | { kind: "granted"; points: number }
  /** Their Claim came after their window closed. `endedOn` is when it closed. */
  | { kind: "closed"; endedOn: string };

/**
 * Read after the sign-in's Claim, so a bonus it granted is here on the same
 * page load. Null while points are off, for a Customer who is not migrated,
 * or when nothing can be read.
 */
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
