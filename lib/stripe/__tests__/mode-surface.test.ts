import { describe, expect, it } from "vitest";

/**
 * `.check.ts` files are executable assertions that nothing runs — vitest collects
 * only `*.{test,spec}.ts` and `pnpm ci` never invokes them. Importing the check here
 * runs its top-level assertions inside the suite CI does run.
 *
 * Same trick as `lib/pricing/__tests__/pricing-surface.test.ts`, for the same reason.
 */
describe("stripe id surface", () => {
  it("reads and writes every Stripe id through the per-account resolver", async () => {
    await expect(import("@/lib/stripe/mode.check")).resolves.toBeDefined();
  });
});
