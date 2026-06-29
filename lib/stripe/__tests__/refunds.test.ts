import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the params/options passed to Stripe without hitting the network.
const createRefund = vi.fn(async () => ({ id: "re_123", status: "succeeded" }));
vi.mock("../client", () => ({
  getStripe: () => ({ refunds: { create: createRefund } }),
}));

const { refundPayment } = await import("../refunds");

function lastCall() {
  return createRefund.mock.calls.at(-1) as unknown as [
    Record<string, unknown>,
    { idempotencyKey: string },
  ];
}

beforeEach(() => createRefund.mockClear());

describe("refundPayment", () => {
  it("issues a full refund with an idempotency key and no amount", async () => {
    await refundPayment({ paymentIntentId: "pi_1", idempotencyKey: "refund_o1" });
    const [params, options] = lastCall();
    expect(params).toEqual({ payment_intent: "pi_1" });
    expect(options).toEqual({ idempotencyKey: "refund_o1" });
  });

  it("converts a partial amount to the smallest currency unit and forwards reason/metadata", async () => {
    await refundPayment({
      paymentIntentId: "pi_1",
      amount: 12.5,
      idempotencyKey: "refund_o1_1250",
      reason: "requested_by_customer",
      metadata: { order_id: "o1" },
    });
    const [params, options] = lastCall();
    expect(params.amount).toBe(1250); // dollars -> cents
    expect(params.reason).toBe("requested_by_customer");
    expect(params.metadata).toEqual({ order_id: "o1" });
    expect(options.idempotencyKey).toBe("refund_o1_1250");
  });
});
