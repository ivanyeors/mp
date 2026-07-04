import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductVariant } from "@/lib/types/ecommerce";

// Capture the params passed to Stripe without hitting the network.
const createSession = vi.fn(async () => ({
  id: "cs_test_123",
  url: "https://stripe.test/cs_test_123",
}));
const createCoupon = vi.fn(async () => ({ id: "coupon_test" }));
const createCustomer = vi.fn(async () => ({ id: "cus_test" }));
vi.mock("../client", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: createSession } },
    coupons: { create: createCoupon },
    customers: { create: createCustomer },
  }),
}));

const { createCheckoutSession } = await import("../checkout");

function sessionArg() {
  return createSession.mock.calls.at(-1)![0]!;
}

function variant(): ProductVariant {
  return {
    id: "v1",
    stripe_price_id: "price_v1",
    price: 89,
    currency: "SGD",
    title: "Default",
  } as ProductVariant;
}

const base = {
  customerEmail: "a@b.com",
  orderId: "o1",
  orderNumber: "MP-1",
  successUrl: "https://x/success",
  cancelUrl: "https://x/cancel",
};

function lineItemsArg() {
  return createSession.mock.calls.at(-1)![0]!.line_items as Array<{
    price?: string;
    quantity: number;
    price_data?: { currency: string; unit_amount: number; product_data: { name: string } };
  }>;
}

beforeEach(() => {
  createSession.mockClear();
  createCoupon.mockClear();
  createCustomer.mockClear();
});

describe("createCheckoutSession — customization add-ons", () => {
  it("adds a per-unit add-on line item alongside the base price", async () => {
    await createCheckoutSession({
      ...base,
      lineItems: [{ variant: variant(), quantity: 2, addonAmount: 25, addonLabel: "Pillow — customization" }],
    });

    const items = lineItemsArg();
    expect(items[0]).toEqual({ price: "price_v1", quantity: 2 });
    const addon = items.find((i) => i.price_data);
    expect(addon).toBeDefined();
    expect(addon!.quantity).toBe(2);
    expect(addon!.price_data!.unit_amount).toBe(2500); // dollars -> cents
    expect(addon!.price_data!.currency).toBe("sgd");
    expect(addon!.price_data!.product_data.name).toBe("Pillow — customization");
  });

  it("omits the add-on line item when there is no add-on", async () => {
    await createCheckoutSession({ ...base, lineItems: [{ variant: variant(), quantity: 1, addonAmount: 0 }] });
    expect(lineItemsArg().some((i) => i.price_data)).toBe(false);
  });
});

describe("createCheckoutSession — discount + Stripe Tax", () => {
  it("applies the discount as an amount_off coupon on the session", async () => {
    await createCheckoutSession({
      ...base,
      lineItems: [{ variant: variant(), quantity: 1 }],
      discountAmount: 12.5,
      discountLabel: "SAVE10",
    });

    expect(createCoupon).toHaveBeenCalledWith(
      expect.objectContaining({ amount_off: 1250, currency: "sgd", duration: "once", name: "SAVE10" })
    );
    expect(sessionArg().discounts).toEqual([{ coupon: "coupon_test" }]);
  });

  it("enables automatic_tax with a customer address and drops the manual tax line", async () => {
    await createCheckoutSession({
      ...base,
      lineItems: [{ variant: variant(), quantity: 1 }],
      automaticTax: true,
      customerName: "Jane",
      customerAddress: { line1: "1 Road", city: "Singapore", postal_code: "100000", country: "SG" },
      // A manual tax amount is passed but must be ignored in automatic mode.
      taxAmount: 8,
      taxLabel: "GST (9%)",
    });

    const params = sessionArg();
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.customer).toBe("cus_test");
    expect(params.customer_email).toBeUndefined();
    expect(createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ address: expect.objectContaining({ country: "SG" }) })
    );
    // No manual tax line item when Stripe Tax computes it.
    expect(lineItemsArg().some((i) => i.price_data?.product_data.name === "GST (9%)")).toBe(false);
  });

  it("falls back to a guest email + manual tax line when Stripe Tax is off", async () => {
    await createCheckoutSession({
      ...base,
      lineItems: [{ variant: variant(), quantity: 1 }],
      taxAmount: 8,
      taxLabel: "GST (9%)",
    });

    const params = sessionArg();
    expect(params.customer_email).toBe("a@b.com");
    expect(params.automatic_tax).toBeUndefined();
    expect(lineItemsArg().some((i) => i.price_data?.product_data.name === "GST (9%)")).toBe(true);
  });
});
