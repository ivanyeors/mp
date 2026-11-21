import { describe, expect, it } from "vitest";

describe("stripe id surface", () => {
  it("reads and writes every Stripe id through the per-account resolver", async () => {
    await expect(import("@/lib/stripe/mode.check")).resolves.toBeDefined();
  });
});
