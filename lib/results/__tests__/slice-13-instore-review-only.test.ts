/**
 * Slice 13 — In-store measurement-only Results (no Stripe hold).
 * Maps to .claude/PRD-template-linked-customisation/issues/13-instore-review-only.md
 */
import { describe, it, expect, vi } from "vitest";
import { transitionResult } from "@/lib/result-lifecycle";
import {
  ballparkFromMpConfigData,
  inferSizeFromMeasurements,
} from "@/lib/results/instore-ballpark";
import {
  buildInstoreReviewOnlyPatch,
  shouldCreateInstoreReviewOnly,
} from "@/lib/results/instore-finalize";

vi.mock("@/lib/rules-engine/persist", () => ({
  getLatestPublished: async () => null,
}));

describe("slice 13 — in-store review-only Results", () => {
  it("AC1: finalize patch creates held Result with no payment fields", async () => {
    const patch = await buildInstoreReviewOnlyPatch({
      shoulderLength: "42",
      neckToBack: "10",
      headToBack: "12",
      neckLength: "10",
      acidReflux: "no",
      earDiscomfortSideSleep: "no",
    });
    expect(patch.status).toBe("held");
    expect(patch.payment_intent_id).toBeNull();
    expect(patch.authorized_amount).toBeNull();
    expect(patch.product_type).toBe("pillow");
    expect(patch.suggested_size).toBe("M");
    // Premium flow sold tier is flow-scoped (rules-engine cutover).
    expect(patch.suggested_tier).toBe("premium");
    expect(patch.recommendation_record).toBeTruthy();
  });

  it("AC1/AC7: skips review-only when online purchase hold already exists", () => {
    expect(
      shouldCreateInstoreReviewOnly({
        payment_intent_id: "pi_123",
        source: "online_purchase",
      }),
    ).toBe(false);
    expect(
      shouldCreateInstoreReviewOnly({ source: "online_purchase", payment_intent_id: null }),
    ).toBe(false);
    expect(shouldCreateInstoreReviewOnly({ source: "manual", payment_intent_id: null })).toBe(
      true,
    );
  });

  it("AC2/AC4: legacy ballpark suggests size×tier only — no fillings invented for sale", () => {
    const ballpark = ballparkFromMpConfigData({
      shoulderLength: "48",
      acidReflux: "yes",
    });
    expect(ballpark.suggested_size).toBe("L");
    expect(ballpark.suggested_tier).toBe("premium");
    expect(Object.keys(ballpark)).toEqual(["suggested_size", "suggested_tier"]);
  });

  it("AC3/AC4: operator can assign without payment intent; accept blocked", () => {
    const assign = transitionResult(
      { status: "held", filling_template_id: null, payment_intent_id: null },
      { action: "assign", filling_template_id: 5 },
    );
    expect(assign).toEqual({ ok: true, status: "assigned", releaseHold: false });

    const accept = transitionResult(
      { status: "assigned", filling_template_id: 5, payment_intent_id: null },
      { action: "accept" },
    );
    expect(accept.ok).toBe(false);
  });

  it("AC6: online held Results still require payment intent to accept", () => {
    const accept = transitionResult(
      { status: "assigned", filling_template_id: 5, payment_intent_id: "pi_1" },
      { action: "accept" },
    );
    expect(accept).toEqual({ ok: true, status: "accepted", releaseHold: false });
  });

  it("inferSizeFromMeasurements defaults when shoulder missing", () => {
    expect(inferSizeFromMeasurements({}).size).toBe("M");
  });
});
