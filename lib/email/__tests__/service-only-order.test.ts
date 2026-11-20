import { describe, expect, it } from "vitest";

import { planOrderConfirmedEmails } from "@/lib/email";

const base = {
  order_number: "1077",
  email: "ada@x.test",
  currency: "SGD",
  subtotal: 30,
  shipping_amount: 0,
  tax_amount: 0,
  discount_amount: 0,
  total: 30,
};

describe("planOrderConfirmedEmails", () => {
  it("sends only the receipt for a service-only Order", () => {
    const plans = planOrderConfirmedEmails({
      ...base,
      order_items: [{ product_title: "Re-adjustment service", quantity: 1, total_price: 30, kind: "service" }],
    });
    expect(plans.map((p) => p.template)).toEqual(["payment_receipt"]);
  });

  it("sends both for an Order with goods, including a build that carries a service fee", () => {
    const plans = planOrderConfirmedEmails({
      ...base,
      order_items: [
        { product_title: "Custom Mpillow M premium", quantity: 1, total_price: 360, kind: "goods" },
        { product_title: "Measurement service (Premium)", quantity: 1, total_price: 50, kind: "service" },
      ],
    });
    expect(plans.map((p) => p.template)).toEqual(["order_confirmation", "payment_receipt"]);
  });
});
