import { describe, expect, it } from "vitest";

import { sizeSortKey } from "@/lib/ecommerce/from-inventory";

describe("sizeSortKey", () => {
  it("orders pillow sizes XS→XL and puts null last", () => {
    const sizes = ["L", null, "XS", "M", "S", "XL"] as const;
    const sorted = [...sizes].sort((a, b) => sizeSortKey(a) - sizeSortKey(b));
    expect(sorted).toEqual(["XS", "S", "M", "L", "XL", null]);
  });
});
