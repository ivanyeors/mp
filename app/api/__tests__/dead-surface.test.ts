import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("the retired routes stay deleted", () => {
  const root = new URL("../../../", import.meta.url);
  expect(existsSync(new URL("app/api/shop/reviews/route.ts", root))).toBe(true);
  for (const path of [
    "app/api/mp-maker/configs/route.ts",
    "app/api/mp-maker/configs/[name]/route.ts",
    "app/api/google/place-id/route.ts",
    "app/api/stripe/test-checkout/route.ts",
    "app/stripe-test/page.tsx",
    "app/api/shop/products/[id]/stock/route.ts",
    "app/api/shop/cart/route.ts",
    "app/api/shop/cart/items/[itemId]/route.ts",
    "app/[lang]/settings/customers/actions.ts",
    "app/api/reviews/route.ts",
  ]) {
    expect(existsSync(fileURLToPath(new URL(path, root))), path).toBe(false);
  }
});
