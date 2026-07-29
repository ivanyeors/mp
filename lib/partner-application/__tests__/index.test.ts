import { describe, it, expect } from "vitest";
import {
  AGREEMENT_VERSION,
  BUSINESS_CATEGORIES,
  canTransitionApplication,
  needsReaccept,
  validateApplication,
  type ApplicationFields,
  type ApplicationStatus,
} from "@/lib/partner-application";

/**
 * Spec tests for the PURE partner-application domain (#83). External behaviour
 * only: inputs → outcomes on the public functions. No storage shapes, no call
 * order, no DB. Mirrors lib/rma/__tests__/transitions.test.ts.
 */

const ALL_STATUSES: ApplicationStatus[] = ["pending", "approved", "rejected"];

function validFields(): ApplicationFields {
  return {
    companyName: "Acme Physio",
    uen: "201812345A",
    website: "https://acme.example",
    category: "physio",
    contactName: "Jane Tan",
    contactMobile: "87805311",
    businessEmail: "jane@acme.example",
    introPlan: "We will recommend Mpillow to post-op clients.",
  };
}

describe("canTransitionApplication (status machine)", () => {
  it("allows the two legal edges out of pending", () => {
    expect(canTransitionApplication("pending", "approved")).toBe(true);
    expect(canTransitionApplication("pending", "rejected")).toBe(true);
  });

  it("refuses every edge out of the terminal states (approved/rejected)", () => {
    for (const to of ALL_STATUSES) {
      expect(canTransitionApplication("approved", to)).toBe(false);
      expect(canTransitionApplication("rejected", to)).toBe(false);
    }
  });

  it("never allows a transition back to pending", () => {
    for (const from of ALL_STATUSES) {
      expect(canTransitionApplication(from, "pending")).toBe(false);
    }
  });

  it("refuses self-loops", () => {
    for (const s of ALL_STATUSES) {
      expect(canTransitionApplication(s, s)).toBe(false);
    }
  });
});

describe("needsReaccept (re-accept trigger on version bump)", () => {
  it("is true when nothing was ever accepted (null / undefined)", () => {
    expect(needsReaccept(null)).toBe(true);
    expect(needsReaccept(undefined)).toBe(true);
  });

  it("is true when the accepted version is stale", () => {
    expect(needsReaccept("2020-01-01")).toBe(true);
    expect(needsReaccept("2020-01-01", "2026-07-28")).toBe(true);
  });

  it("is false only when the accepted version matches the current one", () => {
    expect(needsReaccept(AGREEMENT_VERSION)).toBe(false);
    expect(needsReaccept("2026-07-28", "2026-07-28")).toBe(false);
  });
});

describe("AGREEMENT_VERSION", () => {
  it("is a present, non-empty dated string", () => {
    expect(typeof AGREEMENT_VERSION).toBe("string");
    expect(AGREEMENT_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("is self-consistent: accepting the current version clears re-accept", () => {
    expect(needsReaccept(AGREEMENT_VERSION)).toBe(false);
  });
});

describe("validateApplication", () => {
  it("returns {} for fully valid input", () => {
    expect(validateApplication(validFields())).toEqual({});
  });

  it("flags each required field when blank", () => {
    for (const key of [
      "companyName",
      "website",
      "contactName",
      "introPlan",
      "uen",
      "contactMobile",
      "businessEmail",
    ] as const) {
      const errors = validateApplication({ ...validFields(), [key]: "" });
      expect(errors[key], `expected an error for blank ${key}`).toBeTruthy();
    }
  });

  it("rejects a malformed UEN (wrong shape) but accepts the ACRA envelope", () => {
    expect(validateApplication({ ...validFields(), uen: "123" }).uen).toBeTruthy();
    expect(validateApplication({ ...validFields(), uen: "12345678!" }).uen).toBeTruthy();
    // 9–10 alphanumerics — ROB, ROC and other-agency shapes all pass.
    expect(validateApplication({ ...validFields(), uen: "12345678A" }).uen).toBeUndefined();
    expect(validateApplication({ ...validFields(), uen: "T09LL0001B" }).uen).toBeUndefined();
    // case-insensitive: lowercase is upper-cased before the shape check.
    expect(validateApplication({ ...validFields(), uen: "t09ll0001b" }).uen).toBeUndefined();
  });

  it("rejects an invalid mobile via the phone normalizer", () => {
    expect(validateApplication({ ...validFields(), contactMobile: "12" }).contactMobile).toBeTruthy();
    expect(
      validateApplication({ ...validFields(), contactMobile: "not-a-phone" }).contactMobile,
    ).toBeTruthy();
    expect(
      validateApplication({ ...validFields(), contactMobile: "87805311" }).contactMobile,
    ).toBeUndefined();
  });

  it("rejects a malformed email", () => {
    expect(validateApplication({ ...validFields(), businessEmail: "nope" }).businessEmail).toBeTruthy();
    expect(
      validateApplication({ ...validFields(), businessEmail: "a@b" }).businessEmail,
    ).toBeTruthy();
    expect(
      validateApplication({ ...validFields(), businessEmail: "a@b.co" }).businessEmail,
    ).toBeUndefined();
  });

  it("rejects a category outside the allowed set", () => {
    const errors = validateApplication({
      ...validFields(),
      category: "banana" as ApplicationFields["category"],
    });
    expect(errors.category).toBeTruthy();
    for (const category of BUSINESS_CATEGORIES) {
      expect(validateApplication({ ...validFields(), category }).category).toBeUndefined();
    }
  });

  it("is null/undefined-safe: a partial object never throws", () => {
    // Regression: partial/empty submissions must be validated, not crash.
    expect(() => validateApplication({} as ApplicationFields)).not.toThrow();
    const errors = validateApplication({} as ApplicationFields);
    expect(errors.companyName).toBeTruthy();
    expect(errors.uen).toBeTruthy();
    expect(errors.contactMobile).toBeTruthy();
    expect(errors.businessEmail).toBeTruthy();
    expect(errors.category).toBeTruthy();

    const nulls = {
      companyName: null,
      uen: null,
      website: null,
      category: null,
      contactName: null,
      contactMobile: null,
      businessEmail: null,
      introPlan: null,
    } as unknown as ApplicationFields;
    expect(() => validateApplication(nulls)).not.toThrow();
  });
});
