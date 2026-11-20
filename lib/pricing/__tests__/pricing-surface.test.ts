import { describe, expect, it } from "vitest";

describe("pricing surface", () => {
  it("keeps the sell rule in one module and product_prices behind one loader", async () => {
    await expect(import("@/lib/pricing/pricing-surface.check")).resolves.toBeDefined();
  });
});
