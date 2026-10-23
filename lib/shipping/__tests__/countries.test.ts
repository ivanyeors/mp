import { describe, expect, it } from "vitest";
import {
  COUNTRIES,
  REGIONS,
  countryName,
  deliveryCountries,
  findCountry,
  isPostalReady,
  quoteCity,
  regionCodes,
  summarizeCountries,
  usesPostalCode,
} from "@/lib/shipping/countries";
import { QuoteDestinationSchema } from "@/lib/shipping/destination-schema";

describe("country catalog", () => {
  it("lists each country once, by its ISO code, in a known region", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
      expect(REGIONS.map((r) => r.key)).toContain(c.region);
    }
    expect(COUNTRIES.length).toBeGreaterThan(200);
  });

  it("gives every country a city to quote with, and a quotable sample postal code where it has them", () => {
    for (const c of COUNTRIES) {
      expect(c.city.trim(), c.code).not.toBe("");
      if (c.postal !== null) {
        // The same rules the quote endpoint applies to a shopper's postal code.
        expect(QuoteDestinationSchema.safeParse({ country: c.code, postal_code: c.postal }).success, c.code).toBe(true);
        expect(isPostalReady(c.postal, c.code), c.code).toBe(true);
      }
    }
  });

  it("leaves out comprehensively sanctioned destinations", () => {
    for (const code of ["CU", "IR", "KP", "SY"]) expect(findCountry(code)).toBeUndefined();
  });

  it("starts with the home market", () => {
    expect(REGIONS[0].key).toBe("southeast_asia");
    expect(COUNTRIES[0].code).toBe("SG");
  });
});

describe("lookups", () => {
  it("finds a country by code, whatever its case", () => {
    expect(findCountry(" gb ")?.name).toBe("United Kingdom");
    expect(countryName("jp")).toBe("Japan");
    expect(countryName("xx")).toBe("XX");
    expect(quoteCity("AU")).toBe("Sydney");
    expect(quoteCity("XX")).toBeUndefined();
  });

  it("needs a postal code only where the country has them", () => {
    expect(usesPostalCode("SG")).toBe(true);
    expect(usesPostalCode("HK")).toBe(false);
    expect(usesPostalCode("AE")).toBe(false);
    // Unknown: ask for one rather than quote without.
    expect(usesPostalCode("XX")).toBe(true);

    expect(isPostalReady("", "HK")).toBe(true);
    expect(isPostalReady("", "SG")).toBe(false);
    expect(isPostalReady("01", "SG")).toBe(false);
    expect(isPostalReady("018 956", "SG")).toBe(true);
  });
});

describe("QuoteDestinationSchema", () => {
  it("requires a postal code where the country has them", () => {
    expect(QuoteDestinationSchema.safeParse({ country: "sg", postal_code: "" }).success).toBe(false);
    expect(QuoteDestinationSchema.safeParse({ country: "SG" }).success).toBe(false);
    expect(QuoteDestinationSchema.parse({ country: "sg", postal_code: " 018956 " })).toMatchObject({
      country: "SG",
      postal_code: "018956",
    });
  });

  it("quotes without one where the country has none", () => {
    expect(QuoteDestinationSchema.parse({ country: "hk" })).toMatchObject({ country: "HK", postal_code: "" });
    expect(QuoteDestinationSchema.safeParse({ country: "AE", postal_code: "" }).success).toBe(true);
  });

  it("refuses anything that is not a postal code", () => {
    expect(QuoteDestinationSchema.safeParse({ country: "SG", postal_code: "018956; DROP" }).success).toBe(false);
    expect(QuoteDestinationSchema.safeParse({ country: "SGP", postal_code: "018956" }).success).toBe(false);
  });
});

describe("summarizeCountries", () => {
  it("names a whole region by the region", () => {
    expect(summarizeCountries([...regionCodes("europe"), "SG"])).toEqual(["Singapore", "Europe"]);
  });

  it("calls every country worldwide, and keeps codes outside the catalog", () => {
    expect(summarizeCountries(COUNTRIES.map((c) => c.code))).toEqual(["Worldwide"]);
    expect(summarizeCountries([...COUNTRIES.map((c) => c.code), "XK"])).toEqual(["Worldwide", "XK"]);
  });

  it("lists single countries by name, in catalog order", () => {
    expect(summarizeCountries(["MY", "sg", "XK"])).toEqual(["Singapore", "Malaysia", "XK"]);
  });
});

describe("deliveryCountries", () => {
  it("is every country an active method lists, home first, then by name", () => {
    expect(
      deliveryCountries([
        { countries: ["MY", "SG"], is_active: true },
        { countries: ["gb", "AU", "MY"], is_active: true },
        { countries: ["JP"], is_active: false },
        { countries: null },
      ]),
    ).toEqual(["SG", "AU", "MY", "GB"]);
  });

  it("drops anything that is not a country code", () => {
    expect(deliveryCountries([{ countries: ["", "Singapore", "SG"] }])).toEqual(["SG"]);
  });
});
