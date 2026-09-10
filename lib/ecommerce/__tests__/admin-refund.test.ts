import { describe, it, expect } from "vitest";
import {
  refundableAmount,
  refundIdempotencyKey,
  cancelRefundIdempotencyKey,
  isPaidOrder,
} from "../admin-refund";

describe("refundableAmount", () => {
  it("returns remaining balance after partial refunds", () => {
    expect(refundableAmount({ total: 100, amount_refunded: 30 })).toBe(70);
  });

  it("never goes negative", () => {
    expect(refundableAmount({ total: 50, amount_refunded: 60 })).toBe(0);
  });

  it("caps at what was captured, not the order total", () => {
    // A Result order topped up beyond its hold is paid by two intents; only what a
    // charge actually brought in can be refunded.
    expect(
      refundableAmount({ total: 500, amount_captured: 420, amount_refunded: 20 })
    ).toBe(400);
  });

  it("falls back to total when no capture has been rolled up", () => {
    expect(refundableAmount({ total: 100, amount_captured: 0, amount_refunded: 0 })).toBe(100);
  });
});

describe("idempotency keys", () => {
  it("stabilizes admin refund keys per order and amount", () => {
    expect(refundIdempotencyKey("ord-1", 5000)).toBe("admin_refund_ord-1_5000");
    expect(cancelRefundIdempotencyKey("ord-1", 5000)).toBe("admin_cancel_ord-1_5000");
  });
});

describe("isPaidOrder", () => {
  it("treats captured paid orders as paid", () => {
    expect(
      isPaidOrder({
        payment_reference: "pi_1",
        paid_at: "2026-01-01T00:00:00Z",
        status: "confirmed",
        amount_captured: 100,
      })
    ).toBe(true);
  });

  it("treats pending orders as unpaid even with a payment reference", () => {
    expect(
      isPaidOrder({
        payment_reference: "pi_1",
        paid_at: null,
        status: "pending",
        amount_captured: 0,
      })
    ).toBe(false);
  });
});
