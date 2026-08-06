import { describe, it, expect } from "vitest";
import { maskName, maskEmail } from "@/lib/referrals/masking";

describe("maskName — PDPA identity masking (#80)", () => {
  it('"Jo Tan" → "Jo… T."', () => {
    expect(maskName("Jo Tan")).toBe("Jo… T.");
  });
  it("single name → head only, no surname initial", () => {
    expect(maskName("Jo")).toBe("Jo…");
  });
  it("multi-word name uses first two chars + LAST word initial", () => {
    expect(maskName("Mary Jane Watson")).toBe("Ma… W.");
  });
  it("collapses extra whitespace before masking", () => {
    expect(maskName("  Jo   Tan ")).toBe("Jo… T.");
  });
  it('empty / whitespace / null / undefined → "Customer"', () => {
    expect(maskName("")).toBe("Customer");
    expect(maskName("   ")).toBe("Customer");
    expect(maskName(null)).toBe("Customer");
    expect(maskName(undefined)).toBe("Customer");
  });
});

describe("maskEmail — PDPA identity masking (#80)", () => {
  it('"jo@x.com" → "j***@…"', () => {
    expect(maskEmail("jo@x.com")).toBe("j***@…");
  });
  it("keeps only the first local char, hides the domain", () => {
    expect(maskEmail("alice@example.co")).toBe("a***@…");
  });
  it('no "@" → "—"', () => {
    expect(maskEmail("not-an-email")).toBe("—");
  });
  it('"@" at position 0 (empty local part) → "—"', () => {
    expect(maskEmail("@x.com")).toBe("—");
  });
  it('empty / null / undefined → "—"', () => {
    expect(maskEmail("")).toBe("—");
    expect(maskEmail(null)).toBe("—");
    expect(maskEmail(undefined)).toBe("—");
  });
});
