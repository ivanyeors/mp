import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const createPi = vi.fn<
  (params: Stripe.PaymentIntentCreateParams, options?: Stripe.RequestOptions) => Promise<{
    id: string;
    client_secret: string;
  }>
>(async () => ({
  id: "pi_test",
  client_secret: "pi_test_secret",
}));
const createSession = vi.fn<
  (
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ) => Promise<{ id: string; url: string }>
>(async () => ({
  id: "cs_test",
  url: "https://stripe.test/cs",
}));
const capturePi = vi.fn<
  (
    id: string,
    params?: Stripe.PaymentIntentCaptureParams,
    options?: Stripe.RequestOptions,
  ) => Promise<{ id: string; status: string }>
>(async (id: string) => ({
  id,
  status: "succeeded",
}));
const cancelPi = vi.fn<
  (
    id: string,
    params?: Stripe.PaymentIntentCancelParams,
    options?: Stripe.RequestOptions,
  ) => Promise<{ id: string; status: string }>
>(async (id: string) => ({ id, status: "canceled" }));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    paymentIntents: { create: createPi, capture: capturePi, cancel: cancelPi },
    checkout: { sessions: { create: createSession } },
  }),
}));

const {
  toStripeAmountCents,
  createHold,
  createHoldCheckout,
  createTopUpCheckout,
  captureHold,
  releaseHold,
  planCapture,
} = await import("@/lib/authorization-hold");

describe("authorization-hold", () => {
  beforeEach(() => {
    createPi.mockClear();
    createSession.mockClear();
    capturePi.mockClear();
    cancelPi.mockClear();
  });

  it("converts major units to cents", () => {
    expect(toStripeAmountCents(12.34)).toBe(1234);
    expect(toStripeAmountCents(100)).toBe(10000);
  });

  it("creates a manual-capture PaymentIntent", async () => {
    const result = await createHold({
      amount: 150.5,
      currency: "SGD",
      customerEmail: "a@b.com",
      metadata: { result_id: "r1" },
    });
    expect(result).toEqual({ paymentIntentId: "pi_test", clientSecret: "pi_test_secret" });
    const arg = createPi.mock.calls.at(-1)![0];
    expect(arg.amount).toBe(15050);
    expect(arg.capture_method).toBe("manual");
    expect(arg.currency).toBe("sgd");
  });

  it("creates Checkout with manual-capture payment_intent_data", async () => {
    const result = await createHoldCheckout({
      amount: 99,
      currency: "SGD",
      customerEmail: "a@b.com",
      resultId: "r1",
      successUrl: "https://x/ok",
      cancelUrl: "https://x/cancel",
    });
    expect(result.url).toContain("stripe.test");
    const arg = createSession.mock.calls.at(-1)![0];
    expect(arg.payment_intent_data!.capture_method).toBe("manual");
    expect(arg.metadata!.result_id).toBe("r1");
  });

  it("captures and releases by PaymentIntent id", async () => {
    await captureHold("pi_1", 50);
    expect(capturePi).toHaveBeenCalledWith("pi_1", { amount_to_capture: 5000 });
    await releaseHold("pi_2");
    expect(cancelPi).toHaveBeenCalledWith("pi_2");
  });

  it("plans capture vs top-up without over-capturing the hold", () => {
    expect(planCapture(80, 100)).toEqual({ kind: "capture", amount: 80 });
    expect(planCapture(130, 100)).toEqual({
      kind: "top_up",
      holdCapture: 100,
      topUp: 30,
    });
  });

  it("creates immediate-capture top-up Checkout", async () => {
    const result = await createTopUpCheckout({
      amount: 25,
      currency: "SGD",
      customerEmail: "a@b.com",
      resultId: "r1",
      successUrl: "https://x/ok",
      cancelUrl: "https://x/cancel",
    });
    expect(result.url).toContain("stripe.test");
    const arg = createSession.mock.calls.at(-1)![0];
    expect(arg.mode).toBe("payment");
    expect(arg.metadata!.purpose).toBe("result_topup");
    expect(arg.metadata!.result_id).toBe("r1");
    expect(arg.payment_intent_data).toBeUndefined();
  });
});
