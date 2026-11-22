import { describe, it, expect, vi, beforeEach } from "vitest";

const createRefund = vi.fn(async () => ({ id: "re_123", status: "succeeded" }));
const retrieveIntent = vi.fn();
vi.mock("../client", () => ({
  getStripe: () => ({ refunds: { create: createRefund }, paymentIntents: { retrieve: retrieveIntent } }),
}));

const { refundPayment, intentPaymentMethodType } = await import("../refunds");

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
    expect(params.amount).toBe(1250);
    expect(params.reason).toBe("requested_by_customer");
    expect(params.metadata).toEqual({ order_id: "o1" });
    expect(options.idempotencyKey).toBe("refund_o1_1250");
  });
});

describe("intentPaymentMethodType", () => {
  it("reads how the payment was actually made, not the methods Checkout offered", async () => {
    retrieveIntent.mockResolvedValue({
      id: "pi_1",
      payment_method_types: ["card", "paynow"],
      latest_charge: { id: "ch_1", payment_method_details: { type: "paynow" } },
    });
    expect(await intentPaymentMethodType("pi_1")).toBe("paynow");
    expect(retrieveIntent).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge"] });
  });

  it("says it doesn't know when the charge isn't there", async () => {
    retrieveIntent.mockResolvedValue({ id: "pi_1", payment_method_types: ["card"], latest_charge: "ch_1" });
    expect(await intentPaymentMethodType("pi_1")).toBeNull();
    retrieveIntent.mockResolvedValue({ id: "pi_1", payment_method_types: ["card"], latest_charge: null });
    expect(await intentPaymentMethodType("pi_1")).toBeNull();
  });
});
