import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

/** Removed in prod hardening (#173): unauthenticated, uncalled, or dev-only. Keep them gone. */
it("the retired routes stay deleted", () => {
  const root = new URL("../../../", import.meta.url);
  // Guard against a vacuous pass: the root must be the repo, whatever the cwd.
  expect(existsSync(new URL("app/api/shop/reviews/route.ts", root))).toBe(true);
  for (const path of [
    "app/api/mp-maker/configs/route.ts",
    "app/api/mp-maker/configs/[name]/route.ts",
    "app/api/google/place-id/route.ts",
    "app/api/stripe/test-checkout/route.ts",
    "app/stripe-test/page.tsx",
    "app/api/shop/products/[id]/stock/route.ts",
  ]) {
    expect(existsSync(fileURLToPath(new URL(path, root))), path).toBe(false);
  }
});
