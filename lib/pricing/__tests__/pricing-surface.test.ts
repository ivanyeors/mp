import { describe, expect, it } from "vitest";

/**
 * `.check.ts` files are executable assertions, but NOTHING runs them: `pnpm ci` is
 * lint + typecheck + test + build + bundle:check, and vitest collects only
 * `*.{test,spec}.ts`. Eleven of them are red on main today.
 *
 * Importing the check here runs its top-level assertions inside the suite CI does
 * run, so this one cannot rot the same way. Scoped deliberately to the pricing check
 * rather than all of them — adopting the other ten failures is not this change's job.
 */
describe("pricing surface", () => {
  it("keeps the sell rule in one module and product_prices behind one loader", async () => {
    await expect(import("@/lib/pricing/pricing-surface.check")).resolves.toBeDefined();
  });
});
