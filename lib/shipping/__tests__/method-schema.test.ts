import { describe, expect, it } from "vitest";
import { livePriced } from "@/lib/shipping/method-schema";

describe("livePriced", () => {
  it("needs a customisation order rate above 0 on a live method only", () => {
    expect(livePriced({ rate_source: "easyship", base_rate: 0 })).toBe(false);
    expect(livePriced({ rate_source: "easyship", base_rate: 8 })).toBe(true);
    expect(livePriced({ rate_source: "flat", base_rate: 0 })).toBe(true);
    expect(livePriced({ rate_source: "easyship" })).toBe(true);
  });
});
