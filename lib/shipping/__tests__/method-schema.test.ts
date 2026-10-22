import { describe, expect, it } from "vitest";
import { CountriesField, livePriced } from "@/lib/shipping/method-schema";

describe("livePriced", () => {
  it("needs a customisation order rate above 0 on a live method only", () => {
    expect(livePriced({ rate_source: "easyship", base_rate: 0 })).toBe(false);
    expect(livePriced({ rate_source: "easyship", base_rate: 8 })).toBe(true);
    expect(livePriced({ rate_source: "flat", base_rate: 0 })).toBe(true);
    expect(livePriced({ rate_source: "easyship" })).toBe(true);
  });
});

describe("CountriesField", () => {
  it("takes two-letter codes, upper-cased, and at least one", () => {
    expect(CountriesField.parse([" sg", "MY"])).toEqual(["SG", "MY"]);
    expect(CountriesField.safeParse([]).success).toBe(false);
    expect(CountriesField.safeParse(["SGP"]).success).toBe(false);
    expect(CountriesField.safeParse(["Singapore"]).success).toBe(false);
  });
});
