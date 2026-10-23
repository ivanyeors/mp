import { describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/shipping/countries";
import { needsState, STATE_COUNTRIES } from "@/lib/shipping/state-countries";
import { destinationState, STATE_RULE_COUNTRIES } from "@/lib/shipping/states";

const NEEDS_STATE = ["AU", "CA", "CN", "ID", "MX", "MY", "TH", "US", "VN"];

describe("destinationState", () => {
  it("reads the state from the postal code", () => {
    const cases: [country: string, postal: string, state: string][] = [
      ["US", "91606", "CA"],
      ["US", "10001", "NY"],
      ["US", "60601-1234", "IL"],
      ["US", "02108", "MA"],
      ["US", "20500", "DC"],
      ["US", "99501", "AK"],
      ["CA", "M5H 2N2", "ON"],
      ["CA", "h3b", "QC"],
      ["CA", "X0A 0H0", "NU"],
      ["CA", "X1A 2L9", "NT"],
      ["AU", "2000", "NSW"],
      ["AU", "2600", "ACT"],
      ["AU", "0800", "NT"],
      ["AU", "3000", "VIC"],
      ["AU", "6000", "WA"],
      ["MX", "06000", "Ciudad de México"],
      ["MX", "44100", "Jalisco"],
      ["MX", "64000", "Nuevo León"],
      ["MY", "50450", "Kuala Lumpur"],
      ["MY", "80000", "Johor"],
      ["MY", "10200", "Penang"],
      ["MY", "88000", "Sabah"],
      ["TH", "10200", "Bangkok"],
      ["TH", "50000", "Chiang Mai"],
      ["TH", "83000", "Phuket"],
      ["CN", "200000", "Shanghai"],
      ["CN", "100000", "Beijing"],
      ["CN", "518000", "Guangdong"],
    ];
    for (const [country, postal_code, state] of cases) {
      expect(destinationState({ country, postal_code }), `${country} ${postal_code}`).toBe(state);
    }
  });

  it("quotes with the main city's state when the postal code does not say", () => {
    expect(destinationState({ country: "us", postal_code: "123" })).toBe("NY");
    expect(destinationState({ country: "CA", postal_code: "" })).toBe("ON");
    expect(destinationState({ country: "ID", postal_code: "10110" })).toBe("DKI Jakarta");
    expect(destinationState({ country: "VN", postal_code: "700000" })).toBe("Ho Chi Minh");
  });

  it("does not guess when asked not to", () => {
    expect(destinationState({ country: "US", postal_code: "123" }, { guess: false })).toBeUndefined();
    expect(destinationState({ country: "US", postal_code: "91606" }, { guess: false })).toBe("CA");
  });

  it("keeps the shopper's state, as an abbreviation where Easyship wants one", () => {
    expect(destinationState({ country: "US", postal_code: "10001", state: "new york" })).toBe("NY");
    expect(destinationState({ country: "AU", postal_code: "2000", state: "Victoria" })).toBe("VIC");
    expect(destinationState({ country: "CA", postal_code: "M5H", state: "QC" })).toBe("QC");
    expect(destinationState({ country: "MY", postal_code: "80000", state: "Johor" })).toBe("Johor");
    expect(destinationState({ country: "GB", postal_code: "SW1A 1AA", state: "Greater London" })).toBe(
      "Greater London",
    );
  });

  it("sends none where the country needs none", () => {
    expect(destinationState({ country: "SG", postal_code: "018956" })).toBeUndefined();
    expect(destinationState({ country: "GB", postal_code: "SW1A 1AA" })).toBeUndefined();
  });

  it("has a rule for exactly the countries an address form asks a state for", () => {
    expect([...STATE_RULE_COUNTRIES].sort()).toEqual([...STATE_COUNTRIES].sort());
    expect(needsState(" us ")).toBe(true);
    expect(needsState("SG")).toBe(false);
  });

  it("finds a state for every catalog country that needs one, from its sample postal code", () => {
    for (const code of NEEDS_STATE) {
      const country = COUNTRIES.find((c) => c.code === code)!;
      expect(destinationState({ country: code, postal_code: country.postal }), code).toBeTruthy();
    }
  });
});
