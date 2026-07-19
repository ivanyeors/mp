import {
  inputsFromMpConfigData,
  recommendWithEngine,
  toPersistedRecommendationRecord,
  type RecommendationRecord,
} from "@/lib/rules-engine";
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

export type InstoreReviewOnlyPatch = {
  is_final: true;
  status: "held";
  product_type: "pillow";
  suggested_size: string;
  suggested_tier: "basic" | "premium";
  payment_intent_id: null;
  authorized_amount: null;
  source: "manual";
  recommendation_record: Record<string, unknown>;
};

/** DB patch for in-store measurement finalization — held queue, no authorization. */
export async function buildInstoreReviewOnlyPatch(
  data: Record<string, unknown>,
): Promise<InstoreReviewOnlyPatch> {
  const result = await recommendWithEngine("premium-mpillow", inputsFromMpConfigData(data));
  let record: RecommendationRecord;
  let size: string;
  let tier: "basic" | "premium";

  if ("error" in result) {
    // Missing inputs → legacy ballpark so finalize still lands a size×tier.
    const ballpark = ballparkFromMpConfigData(data);
    size = ballpark.suggested_size;
    tier = "premium"; // Premium flow sold tier
    record = {
      graphVersionId: null,
      flow: "premium-mpillow",
      entryFlow: "premium-mpillow",
      finalFlow: "premium-mpillow",
      size: ballpark.suggested_size,
      templateId: null,
      tierSuggestion: ballpark.suggested_tier,
      soldTier: "premium",
      flowRoute: null,
      flowRouteDecision: null,
      firedTerminals: [],
      trace: [],
      usedFallback: false,
      usedLegacyBootstrap: true,
    };
  } else {
    record = result;
    size = String(result.size ?? "M");
    tier = result.soldTier ?? "premium";
  }

  return {
    is_final: true,
    status: "held",
    product_type: "pillow",
    suggested_size: size,
    suggested_tier: tier,
    payment_intent_id: null,
    authorized_amount: null,
    source: "manual",
    recommendation_record: toPersistedRecommendationRecord(record),
  };
}
