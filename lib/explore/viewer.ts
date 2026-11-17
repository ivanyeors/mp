/**
 * What the Explore page knows about a signed-in visitor: their balance, what
 * they were given, and whether a Welcome bonus is still theirs to claim.
 * Server only (the ledger is service-role only); each call takes the client,
 * so tests pass a fake.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { marketingEmailState, type MarketingEmailState } from "@/lib/marketing-consent/state";
import { isPartnerCustomer, readPointsBalance } from "@/lib/points/server";

/** The ledger kinds the page names when it says where the points came from. */
export const EXPLORE_GIFT_KINDS = ["welcome_bonus", "claim_bonus", "past_purchases", "explore_flower"] as const;
export type ExploreGiftKind = (typeof EXPLORE_GIFT_KINDS)[number];

export interface ExploreViewer {
  /** Points they can use now. */
  points: number;
  /** What they were given, by kind, in points; kinds with nothing are left out. */
  gifts: { kind: ExploreGiftKind; points: number }[];
  /** A Welcome bonus would be granted if they claimed now. */
  canClaim: boolean;
  partner: boolean;
  marketing: MarketingEmailState;
}

export interface ExploreFlowers {
  /** How many flowers grow today; 0 for none. */
  count: number;
  /** The ones this visitor has picked today. */
  picked: number[];
  /** A pick would give this visitor points: signed in, points live, not a partner, and under the S$5 cap. */
  givesPoints: boolean;
}

export const NO_FLOWERS: ExploreFlowers = { count: 0, picked: [], givesPoints: false };

const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

/** Pure — the gifts list from a Customer's ledger rows of those kinds, in the order the page names them. */
export function giftsFromEntries(rows: readonly { kind: string; points: number }[]): ExploreViewer["gifts"] {
  return EXPLORE_GIFT_KINDS.map((kind) => ({
    kind,
    points: rows.filter((r) => r.kind === kind).reduce((sum, r) => sum + int(r.points), 0),
  })).filter((g) => g.points > 0);
}

/**
 * One visitor's standing. `offerOpen` is whether the ladder has an open step
 * (lib/points/welcome.ts). Throws on a failed read.
 */
export async function readExploreViewer(admin: SupabaseClient, customerId: string, offerOpen: boolean): Promise<ExploreViewer> {
  const [balance, entries, migrated, partner, customer] = await Promise.all([
    readPointsBalance(admin, customerId),
    admin.from("points_ledger").select("kind, points").eq("customer_id", customerId).in("kind", [...EXPLORE_GIFT_KINDS]),
    admin.from("migrated_customers").select("customer_id").eq("customer_id", customerId).maybeSingle(),
    isPartnerCustomer(admin, customerId),
    admin.from("customers").select("marketing_email").eq("id", customerId).maybeSingle(),
  ]);
  if (entries.error) throw new Error(`Could not read the points entries: ${entries.error.message}`);
  if (migrated.error) throw new Error(`Could not read the customer's import: ${migrated.error.message}`);
  const gifts = giftsFromEntries((entries.data ?? []) as { kind: string; points: number }[]);
  return {
    points: balance.available,
    gifts,
    canClaim: offerOpen && !partner && !migrated.data && !gifts.some((g) => g.kind === "welcome_bonus"),
    partner,
    marketing: marketingEmailState((customer.data as { marketing_email?: unknown } | null)?.marketing_email),
  };
}

/** Today's flowers for this visitor (or for anyone, signed out). Throws on a failed read. */
export async function readExploreFlowers(admin: SupabaseClient, customerId: string | null): Promise<ExploreFlowers> {
  const { data, error } = await admin.rpc("explore_flowers", { p_customer_id: customerId });
  if (error) throw new Error(`Could not read today's flowers: ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    count: Math.min(5, Math.max(0, int(r?.flowers))),
    picked: Array.isArray(r?.picked) ? (r!.picked as unknown[]).map(int) : [],
    givesPoints: r?.gives_points === true,
  };
}

export type FlowerPickReason = "picked" | "off" | "partner" | "none" | "already" | "spent";

/**
 * Picks a flower (`pick_explore_flower`): 1 to 3 points, once per flower per
 * day, until this Customer's flowers have given 500 points (S$5); then
 * "spent", for good.
 */
export async function pickFlower(
  admin: SupabaseClient,
  customerId: string,
  flower: number,
): Promise<{ picked: boolean; points: number; reason: FlowerPickReason }> {
  const { data, error } = await admin.rpc("pick_explore_flower", { p_customer_id: customerId, p_flower: flower });
  if (error) throw new Error(`Could not pick the flower: ${error.message}`);
  const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const reason = (["picked", "off", "partner", "none", "already", "spent"] as const).find((x) => x === r?.reason) ?? "none";
  return { picked: r?.picked === true, points: int(r?.points), reason };
}
