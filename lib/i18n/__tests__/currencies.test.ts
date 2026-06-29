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
});
