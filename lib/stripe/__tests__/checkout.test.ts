import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProductVariant } from "@/lib/types/ecommerce";
import type Stripe from "stripe";

// Capture the params passed to Stripe without hitting the network.
const createSession = vi.fn<
  (
    params: Stripe.Checkout.SessionCreateParams,
    options?: Stripe.RequestOptions,
  ) => Promise<{ id: string; url: string }>
>(async () => ({
  id: "cs_test_123",
  url: "https://stripe.test/cs_test_123",
}));
const createCoupon = vi.fn<
  (params: Stripe.CouponCreateParams, options?: Stripe.RequestOptions) => Promise<{ id: string }>
>(async () => ({ id: "coupon_test" }));
const createCustomer = vi.fn<
  (params: Stripe.CustomerCreateParams, options?: Stripe.RequestOptions) => Promise<{ id: string }>
>(async () => ({ id: "cus_test" }));
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

describe("createCheckoutSession — customised units", () => {
  it("bills a customised unit as one dynamic line at its composed price", async () => {
    await createCheckoutSession({
      ...base,
      lineItems: [{ variant: variant(), quantity: 2, addonAmount: 25, addonLabel: "Pillow — customization" }],
    });

    // One line, not a catalog price plus a surcharge: 89 + 25 = 114.
    const items = lineItemsArg();
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(2);
    expect(items[0]!.price).toBeUndefined();
    expect(items[0]!.price_data!.unit_amount).toBe(11400);
    expect(items[0]!.price_data!.currency).toBe("sgd");
    expect(items[0]!.price_data!.product_data.name).toBe("Pillow — customization");
  });

  it("charges LESS when the chosen build is cheaper than the shelf price", async () => {
    // A premium XS shelf price is its Fibrecool build; picking linen is -20. Stripe
    // has no negative line item, and the old shape skipped `addonAmount <= 0` —
    // so this shopper was charged the dearer build they had just moved away from.
    await createCheckoutSession({
      ...base,
      lineItems: [{ variant: variant(), quantity: 1, addonAmount: -20 }],
    });

    const items = lineItemsArg();
    expect(items).toHaveLength(1);
    expect(items[0]!.price_data!.unit_amount).toBe(6900); // 89 - 20
  });

  it("uses the catalog Price when the build is untouched", async () => {
    await createCheckoutSession({ ...base, lineItems: [{ variant: variant(), quantity: 1, addonAmount: 0 }] });
    expect(lineItemsArg()).toEqual([{ price: "price_v1", quantity: 1 }]);
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
