import { describe, expect, it } from "vitest";

/**
 * `.check.ts` files are executable assertions that nothing runs — vitest collects
 * only `*.{test,spec}.ts`. Importing a check here runs its top-level assertions in
 * the suite CI does run (the same trick as `lib/stripe/__tests__/mode-surface.test.ts`).
 */
describe("checkout page surface", () => {
  it("keeps the cart until the paid order is confirmed, on Stripe's page or ours", async () => {
    await expect(import("../cart-survives-stripe-cancel.check")).resolves.toBeDefined();
  });

  it("pins the Pay CTA to the mobile action bar", async () => {
    await expect(import("../checkout-sticky-cta.check")).resolves.toBeDefined();
  });
});
