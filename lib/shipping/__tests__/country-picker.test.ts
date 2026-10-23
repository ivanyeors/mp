import { describe, expect, it } from "vitest";
import { countryFlag, countryMatches, groupCountries } from "@/lib/shipping/country-picker";

const OFFERED = ["US", "MY", "SG", "GB", "VN", "JP", "ID", "AE", "BN"];

describe("country picker", () => {
  it("lists Singapore first, then Southeast Asia, then the rest A–Z", () => {
    expect(groupCountries(OFFERED)).toEqual([
      { label: null, codes: ["SG"] },
      { label: "Southeast Asia", codes: ["MY", "ID", "VN", "BN"] },
      { label: "Rest of the world", codes: ["JP", "AE", "GB", "US"] },
    ]);
  });

  it("searches by name, code and common other names, ignoring case and accents", () => {
    expect(groupCountries(OFFERED, "mal")).toEqual([{ label: "Southeast Asia", codes: ["MY"] }]);
    expect(groupCountries(OFFERED, "usa")).toEqual([{ label: "Rest of the world", codes: ["US"] }]);
    expect(groupCountries(OFFERED, "UK").flatMap((g) => g.codes)).toEqual(["GB"]);
    expect(groupCountries(OFFERED, "sg")).toEqual([{ label: null, codes: ["SG"] }]);
    expect(countryMatches("VN", "Viet Nam")).toBe(true);
    expect(countryMatches("CI", "cote")).toBe(true);
    expect(groupCountries(OFFERED, "atlantis")).toEqual([]);
  });

  it("drops duplicates and lower-case codes into one entry", () => {
    expect(groupCountries(["sg", "SG", "my"]).flatMap((g) => g.codes)).toEqual(["SG", "MY"]);
  });

  it("draws a flag from the two-letter code", () => {
    expect(countryFlag("SG")).toBe("🇸🇬");
    expect(countryFlag("us")).toBe("🇺🇸");
    expect(countryFlag("SGP")).toBe("");
  });
});
