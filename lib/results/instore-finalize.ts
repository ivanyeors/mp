import { ballparkFromMpConfigData } from "@/lib/results/instore-ballpark";

type ExistingRow = {
  is_final?: boolean | null;
  payment_intent_id?: string | null;
  source?: string | null;
  status?: string | null;
};

/** Whether first-time finalization should create a review-only held Result (no Stripe hold). */
export function shouldCreateInstoreReviewOnly(
  existing: ExistingRow | null | undefined,
): boolean {
  if (existing?.payment_intent_id) return false;
  if (existing?.source === "online_purchase") return false;
  if (existing?.status === "assigned" || existing?.status === "captured") return false;
  return true;
}

/** DB patch for in-store measurement finalization — held queue, no authorization. */
export function buildInstoreReviewOnlyPatch(data: Record<string, unknown>) {
  const ballpark = ballparkFromMpConfigData(data);
  return {
    is_final: true,
    status: "held" as const,
    product_type: "pillow" as const,
    suggested_size: ballpark.suggested_size,
    suggested_tier: ballpark.suggested_tier,
    payment_intent_id: null,
    authorized_amount: null,
    source: "manual" as const,
  };
}
