import { describe, expect, it } from "vitest";
import { CountriesField } from "@/lib/shipping/method-schema";

describe("CountriesField", () => {
  it("takes two-letter codes, upper-cased, and at least one", () => {
    expect(CountriesField.parse([" sg", "MY"])).toEqual(["SG", "MY"]);
    expect(CountriesField.safeParse([]).success).toBe(false);
    expect(CountriesField.safeParse(["SGP"]).success).toBe(false);
    expect(CountriesField.safeParse(["Singapore"]).success).toBe(false);
  });
});
