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

  it("never relabels an Assisted customisation as an in-store finalize", () => {
    // The configurator hides its own no-purchase button in assisted mode, but the
    // Admin Panel's send-to-Telegram action posts isFinal on a Draft Result too.
    // Without this, that click rewrites source to "manual", which drops the row
    // into measurement_residue and makes its Order be born `delivered`.
    expect(
      shouldCreateInstoreReviewOnly({ source: "staff_assisted", payment_intent_id: null }),
    ).toBe(false);
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

  // Slice 13's AC3 was "accept blocked" — a review-only Result could be assigned
  // and then never sold, which `lib/results/result-stage.ts` named
  // `measurement_residue`: "sits in `held` forever". ADR 0016 reverses that half
  // deliberately: a Result with no hold now settles by Balance payment, so staff
  // can measure a walk-in, build the pillow, and send them a link to pay. The
  // guard moved to `capture`, which still refuses without money — asserted below.
  it("AC3/AC4: operator can assign without payment intent; accept now opens a Balance payment", () => {
    const assign = transitionResult(
      { status: "held", filling_template_id: null, payment_intent_id: null },
      { action: "assign", filling_template_id: 5 },
    );
    expect(assign).toEqual({ ok: true, status: "assigned", releaseHold: false });

    const accept = transitionResult(
      { status: "assigned", filling_template_id: 5, payment_intent_id: null },
      { action: "accept" },
    );
    expect(accept).toEqual({ ok: true, status: "accepted", releaseHold: false });

    // But it still cannot become a paid Order until money actually arrives.
    const unpaid = transitionResult(
      { status: "accepted", filling_template_id: 5, payment_intent_id: null },
      { action: "capture" },
    );
    expect(unpaid.ok).toBe(false);
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
