import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/i18n/currencies";

// formatCurrency is the single money-formatting interface (slice 03).
// These guard the two things that actually matter: the right currency symbol
// shows up, and unknown codes don't throw.
describe("formatCurrency", () => {
  it("defaults to SGD (en-SG: $ symbol, never RM or US$)", () => {
    const out = formatCurrency(1234.5);
    expect(out).toContain("1,234.50");
    expect(out).toContain("$");
    expect(out).not.toContain("RM");
    expect(out).not.toMatch(/US\$|USD/);
  });

  it("honours an explicit currency code", () => {
    expect(formatCurrency(10, "MYR")).toMatch(/RM|MYR/);
    expect(formatCurrency(10, "USD")).toContain("10.00");
  });

  it("always renders two decimals for SGD", () => {
    expect(formatCurrency(5)).toContain("5.00");
    expect(formatCurrency(0)).toContain("0.00");
  });

  it("does not throw on an unknown 3-letter code", () => {
    expect(() => formatCurrency(1, "GBP")).not.toThrow();
  });

  // display: "code" is what every transactional email uses — an email is read
  // out of context, and Intl renders SGD in en-SG as a bare "$".
  it("renders the explicit ISO code for every supported currency", () => {
    // Intl separates the code from the amount with U+00A0, which is what we
    // want: it stops "SGD" and the figure being split across two lines.
    expect(formatCurrency(1234.5, "SGD", { display: "code" })).toBe("SGD\u00A01,234.50");
    for (const code of ["SGD", "MYR", "USD", "CNY"] as const) {
      expect(formatCurrency(1234.5, code, { display: "code" })).toContain(code);
    }
  });

  it("keeps the symbol by default, so on-site surfaces are unaffected", () => {
    expect(formatCurrency(1234.5, "SGD")).toBe("$1,234.50");
    expect(formatCurrency(1234.5, "SGD", { display: "symbol" })).toBe("$1,234.50");
  });

  it("groups digits in both display modes", () => {
    expect(formatCurrency(1234567.5, "SGD", { display: "code" })).toContain("1,234,567.50");
  });
});
