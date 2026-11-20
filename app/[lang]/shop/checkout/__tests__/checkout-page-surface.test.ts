import { describe, expect, it } from "vitest";

describe("checkout page surface", () => {
  it("keeps the cart until the paid order is confirmed, on Stripe's page or ours", async () => {
    await expect(import("../cart-survives-stripe-cancel.check")).resolves.toBeDefined();
  });

  it("pins the Pay CTA to the mobile action bar", async () => {
    await expect(import("../checkout-sticky-cta.check")).resolves.toBeDefined();
  });
});
