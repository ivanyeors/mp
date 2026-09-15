import { existsSync } from "node:fs";
import { expect, it } from "vitest";

/** Removed in prod hardening (#173): unauthenticated, uncalled, or dev-only. Keep them gone. */
it("the retired routes stay deleted", () => {
  for (const path of [
    "app/api/mp-maker/configs/route.ts",
    "app/api/mp-maker/configs/[name]/route.ts",
    "app/api/google/place-id/route.ts",
    "app/api/stripe/test-checkout/route.ts",
    "app/stripe-test/page.tsx",
  ]) {
    expect(existsSync(path), path).toBe(false);
  }
});
