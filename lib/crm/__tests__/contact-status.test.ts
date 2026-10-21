import { describe, expect, it } from "vitest";
import { isValidPhone } from "@/lib/appointments/phone";
import {
  describeMobile,
  describeSignIn,
  emailStatus,
  factsAreFor,
  formatPhone,
  mobileStatus,
  signInMethodLabel,
} from "@/lib/crm/contact-status";

/**
 * Contact status (CRM slice 11; ADR 0027 (j)): every part derived from a fact.
 */

describe("sign-in methods", () => {
  it("names the emailed code and Google as Staff read them", () => {
    expect(signInMethodLabel("email")).toBe("Email code");
    expect(signInMethodLabel("google")).toBe("Google");
    expect(signInMethodLabel("apple")).toBe("Apple");
  });

  it("reads one, both, or none", () => {
    expect(describeSignIn(["email"])).toBe("Email code");
    expect(describeSignIn(["google"])).toBe("Google");
    expect(describeSignIn(["email", "google"])).toBe("Email code and Google");
    expect(describeSignIn([])).toBeNull();
    expect(describeSignIn(undefined)).toBeNull();
  });
});

describe("emailStatus", () => {
  it("is Verified, since the login was bound, for a Customer with an account", () => {
    expect(emailStatus({ hasAccount: true, accountLinkedAt: "2026-10-02T03:00:00Z", createdByImport: true })).toEqual({
      verified: true,
      since: "2026-10-02T03:00:00Z",
    });
  });

  it("is Not verified without one, with where the address came from", () => {
    expect(emailStatus({ hasAccount: false, accountLinkedAt: null, createdByImport: true })).toEqual({
      verified: false,
      source: "shopify-import",
    });
    // Matched by the import: the row, and its email, came from checkout first.
    expect(emailStatus({ hasAccount: false, accountLinkedAt: null, createdByImport: false })).toEqual({
      verified: false,
      source: "checkout",
    });
    expect(emailStatus({ hasAccount: false, accountLinkedAt: null, createdByImport: null })).toEqual({
      verified: false,
      source: "checkout",
    });
  });
});

describe("the mobile on file", () => {
  it("is missing with no number, valid when it passes isValidPhone, and invalid otherwise", () => {
    for (const phone of [null, undefined, "", "   ", "\t"]) expect(mobileStatus(phone), String(phone)).toBe("missing");
    for (const phone of ["87805311", "+65 8780 5311", "6587805311", "+447700900123", "61234567"]) {
      expect(isValidPhone(phone)).toBe(true);
      expect(mobileStatus(phone), phone).toBe("valid");
    }
    for (const phone of ["12345678", "8780 531", "+6512345678", "call me"]) {
      expect(isValidPhone(phone)).toBe(false);
      expect(mobileStatus(phone), phone).toBe("invalid");
    }
  });

  it("formats a Singapore number for reading, and leaves an invalid one as typed", () => {
    expect(formatPhone("87805311")).toBe("+65 8780 5311");
    expect(formatPhone("+65 8780-5311")).toBe("+65 8780 5311");
    expect(formatPhone("+447700900123")).toBe("+447700900123");
    expect(formatPhone(" call me ")).toBe("call me");
  });

  it("says what kind of number it is, never that it is verified", () => {
    expect(describeMobile("87805311")).toBe("Valid Singapore mobile");
    expect(describeMobile("61234567")).toBe("Valid Singapore landline");
    expect(describeMobile("+447700900123")).toBe("Valid overseas number");
    // Well-formed E.164 that only looks like Singapore: +65 and nine digits.
    expect(describeMobile("+65123456789")).toBe("Valid overseas number");
    expect(describeMobile("12345678")).toBe("Not a valid number");
    expect(describeMobile(null)).toBe("No mobile on file");
    for (const phone of ["87805311", "12345678", null]) expect(describeMobile(phone)).not.toMatch(/verified/i);
  });
});

describe("factsAreFor", () => {
  it("holds while the number on file is the one the facts were read for", () => {
    expect(factsAreFor({ phone: "+6587805311" }, " +6587805311 ")).toBe(true);
    expect(factsAreFor({ phone: null }, "")).toBe(true);
    expect(factsAreFor({ phone: "+6587805311" }, "+6591234567")).toBe(false);
    expect(factsAreFor({ phone: null }, "+6591234567")).toBe(false);
  });
});
