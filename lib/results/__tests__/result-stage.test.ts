import { describe, expect, it } from "vitest";
import { bucketFor, resultStage, type StageInput } from "../result-stage";

const NOW = new Date("2026-09-09T12:00:00.000Z");
const FRESH = "2026-09-09T09:00:00.000Z";
const OLD = "2026-09-01T09:00:00.000Z";

function row(over: Partial<StageInput> = {}): StageInput {
  return {
    status: "held",
    source: "online_purchase",
    payment_intent_id: "pi_1",
    created_at: FRESH,
    order_id: null,
    topup_paid_at: null,
    // A real `online_purchase` row always has this stamped at submit — the hold
    // amount is written in the same insert that sets the source.
    authorized_amount: 120,
    order: null,
    ...over,
  };
}

describe("resultStage — pre-capture", () => {
  it("held with a hold is waiting on staff", () => {
    expect(resultStage(row(), NOW).stage).toBe("needs_assign");
  });

  it("assigned is waiting on the customer", () => {
    expect(resultStage(row({ status: "assigned" }), NOW).stage).toBe("awaiting_customer");
  });

  it("an in-store draft with no status is measurement only", () => {
    expect(resultStage(row({ status: null, source: "manual" }), NOW).stage).toBe(
      "measurement_only",
    );
  });

  it("declined, expired and cancelled are all closed", () => {
    for (const status of ["declined", "expired", "cancelled"]) {
      expect(resultStage(row({ status }), NOW).stage).toBe("closed");
    }
  });
});

describe("resultStage — post-capture follows the Order", () => {
  const captured = { status: "captured", order_id: "o1" };

  it("confirmed order is waiting to be built", () => {
    const s = resultStage(
      row({ ...captured, order: { status: "confirmed", delivered_at: null } }),
      NOW,
    );
    expect(s.stage).toBe("to_build");
  });

  it("processing order is being built", () => {
    expect(
      resultStage(row({ ...captured, order: { status: "processing", delivered_at: null } }), NOW)
        .stage,
    ).toBe("building");
  });

  it("shipped order is shipped", () => {
    expect(
      resultStage(row({ ...captured, order: { status: "shipped", delivered_at: null } }), NOW)
        .stage,
    ).toBe("shipped");
  });

  it("delivered order is handed over", () => {
    expect(
      resultStage(
        row({ ...captured, order: { status: "delivered", delivered_at: FRESH } }),
        NOW,
      ).stage,
    ).toBe("handed_over");
  });

  it("an in-store handover is handed over even if status lags", () => {
    // accept() stamps delivered_at at capture for in-store; trust the timestamp.
    expect(
      resultStage(row({ ...captured, order: { status: "confirmed", delivered_at: FRESH } }), NOW)
        .stage,
    ).toBe("handed_over");
  });

  it("a refunded or cancelled order is closed, not work in progress", () => {
    for (const status of ["refunded", "cancelled"]) {
      expect(
        resultStage(row({ ...captured, order: { status, delivered_at: null } }), NOW).stage,
      ).toBe("closed");
    }
  });
});

describe("resultStage — stuck states", () => {
  it("abandoned checkout: held online with no payment intent", () => {
    const s = resultStage(row({ payment_intent_id: null }), NOW);
    expect(s.stage).toBe("stuck");
    expect(s.stuckReason).toBe("abandoned_checkout");
  });

  it("measurement residue: held in-store with no payment intent", () => {
    // buildInstoreReviewOnlyPatch sets authorized_amount: null — in-store
    // measurement never authorizes a card.
    const s = resultStage(
      row({ payment_intent_id: null, source: "manual", authorized_amount: null }),
      NOW,
    );
    expect(s.stuckReason).toBe("measurement_residue");
  });

  it("hold rotting: assigned and older than the auth window", () => {
    const s = resultStage(row({ status: "assigned", created_at: OLD }), NOW);
    expect(s.stage).toBe("stuck");
    expect(s.stuckReason).toBe("hold_rotting");
  });

  it("a fresh assigned row is not yet rotting", () => {
    expect(resultStage(row({ status: "assigned", created_at: FRESH }), NOW).stage).toBe(
      "awaiting_customer",
    );
  });

  it("top-up paid but never settled into an Order", () => {
    const s = resultStage(row({ status: "assigned", topup_paid_at: FRESH }), NOW);
    expect(s.stuckReason).toBe("topup_unsettled");
  });

  it("order linked without capture", () => {
    const s = resultStage(row({ status: "held", order_id: "o1" }), NOW);
    expect(s.stuckReason).toBe("order_mismatch");
  });

  it("needs_attention on the order outranks the happy path", () => {
    const s = resultStage(
      row({
        status: "captured",
        order_id: "o1",
        order: { status: "confirmed", delivered_at: null, needs_attention: true },
      }),
      NOW,
    );
    expect(s.stage).toBe("stuck");
    expect(s.stuckReason).toBe("needs_attention");
  });
});

describe("resultStage — Assisted customisation (no hold by design)", () => {
  // An Assisted customisation takes no card, so no amount is ever authorized.
  const assisted = (over: Partial<StageInput> = {}) =>
    row({
      source: "staff_assisted",
      payment_intent_id: null,
      authorized_amount: null,
      ...over,
    });

  it("is real work awaiting assignment, not stuck", () => {
    const s = resultStage(assisted(), NOW);
    expect(s.stage).toBe("needs_assign");
    expect(s.stuckReason).toBeNull();
  });

  it("does not become residue with age — nothing is expiring", () => {
    const s = resultStage(assisted({ created_at: OLD }), NOW);
    expect(s.stage).toBe("needs_assign");
    expect(s.stuckReason).toBeNull();
  });

  it("waits on the customer once assigned, and never reads as a rotting hold", () => {
    const s = resultStage(assisted({ status: "assigned", created_at: OLD }), NOW);
    expect(s.stage).toBe("awaiting_customer");
    expect(s.stuckReason).toBeNull();
  });

  it("leaves the other two no-hold sources exactly as they were", () => {
    expect(
      resultStage(row({ source: "online_purchase", payment_intent_id: null }), NOW)
        .stuckReason,
    ).toBe("abandoned_checkout");
    expect(
      resultStage(
        // In-store measurement authorizes nothing.
        row({ source: "manual", payment_intent_id: null, authorized_amount: null }),
        NOW,
      ).stuckReason,
    ).toBe("measurement_residue");
  });
});

describe("resultStage — authorization hold switched off", () => {
  // The toggle suppresses the card step for an ordinary online submit, so the
  // row keeps source `online_purchase` but authorizes nothing. Staging must key
  // on the missing amount, not the source, or every such submit reads as an
  // abandoned checkout the moment holds are turned off.
  const noHold = (over: Partial<StageInput> = {}) =>
    row({ payment_intent_id: null, authorized_amount: null, ...over });

  it("is real work awaiting assignment, not an abandoned checkout", () => {
    const s = resultStage(noHold(), NOW);
    expect(s.stage).toBe("needs_assign");
    expect(s.stuckReason).toBeNull();
  });

  it("does not decay into residue with age", () => {
    const s = resultStage(noHold({ created_at: OLD }), NOW);
    expect(s.stage).toBe("needs_assign");
    expect(s.stuckReason).toBeNull();
  });

  it("still flags an abandoned checkout when a hold WAS expected", () => {
    // Same row, same missing PaymentIntent — only the stamped amount differs.
    expect(resultStage(noHold({ authorized_amount: 120 }), NOW).stuckReason).toBe(
      "abandoned_checkout",
    );
  });

  it("waits on the customer once assigned, with no rotting-hold warning", () => {
    // hold_rotting requires a payment_intent_id, so a no-hold row can't trip it.
    const s = resultStage(noHold({ status: "assigned", created_at: OLD }), NOW);
    expect(s.stage).toBe("awaiting_customer");
    expect(s.stuckReason).toBeNull();
  });
});

describe("bucketFor", () => {
  it("folds building into to_build and handed_over into closed", () => {
    expect(bucketFor("building")).toBe("to_build");
    expect(bucketFor("handed_over")).toBe("closed");
    expect(bucketFor("measurement_only")).toBe("needs_assign");
  });

  it("passes the primary buckets through unchanged", () => {
    expect(bucketFor("needs_assign")).toBe("needs_assign");
    expect(bucketFor("stuck")).toBe("stuck");
  });
});
