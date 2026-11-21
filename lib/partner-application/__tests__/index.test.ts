import { describe, it, expect } from "vitest";
import {
  AGREEMENT_VERSION,
  APPLICATION_FIELD_LABELS,
  BUSINESS_CATEGORIES,
  DESCRIPTION_MAX,
  canTransitionApplication,
  canWithdrawApplication,
  needsReaccept,
  validateApplication,
  type ApplicationFields,
  type ApplicationStatus,
} from "@/lib/partner-application";

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
    description: "Sports and post-op physiotherapy in Tanjong Pagar.",
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
      "description",
    ] as const) {
      const errors = validateApplication({ ...validFields(), [key]: "" });
      expect(errors[key], `expected an error for blank ${key}`).toBeTruthy();
    }
  });

  it("rejects a malformed UEN (wrong shape) but accepts the ACRA envelope", () => {
    expect(validateApplication({ ...validFields(), uen: "123" }).uen).toBeTruthy();
    expect(validateApplication({ ...validFields(), uen: "12345678!" }).uen).toBeTruthy();
    expect(validateApplication({ ...validFields(), uen: "12345678A" }).uen).toBeUndefined();
    expect(validateApplication({ ...validFields(), uen: "T09LL0001B" }).uen).toBeUndefined();
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
      description: null,
      logoUrl: null,
    } as unknown as ApplicationFields;
    expect(() => validateApplication(nulls)).not.toThrow();
    expect(validateApplication(nulls).description).toBeTruthy();
  });
});

describe("validateApplication: the public write-up (description)", () => {
  it("is required: missing, empty or whitespace-only is reported", () => {
    const withoutDescription: Partial<ApplicationFields> = validFields();
    delete withoutDescription.description;
    expect(validateApplication(withoutDescription as ApplicationFields).description).toBeTruthy();
    expect(validateApplication({ ...validFields(), description: "" }).description).toBeTruthy();
    expect(validateApplication({ ...validFields(), description: "   \n\t  " }).description).toBeTruthy();
  });

  it("is the only error when everything else is valid", () => {
    expect(Object.keys(validateApplication({ ...validFields(), description: " " }))).toEqual(["description"]);
  });

  it("caps at DESCRIPTION_MAX (4000) characters", () => {
    expect(DESCRIPTION_MAX).toBe(4000);
    expect(
      validateApplication({ ...validFields(), description: "a".repeat(DESCRIPTION_MAX) }).description,
    ).toBeUndefined();
    expect(
      validateApplication({ ...validFields(), description: "a".repeat(DESCRIPTION_MAX + 1) }).description,
    ).toBeTruthy();
    expect(
      validateApplication({ ...validFields(), description: "a".repeat(DESCRIPTION_MAX * 2) }).description,
    ).toBeTruthy();
  });

  it("measures the cap after trimming surrounding whitespace", () => {
    const padded = `   ${"a".repeat(DESCRIPTION_MAX)}\n\n   `;
    expect(validateApplication({ ...validFields(), description: padded }).description).toBeUndefined();
    const tooLongEvenTrimmed = `  ${"a".repeat(DESCRIPTION_MAX + 1)}  `;
    expect(validateApplication({ ...validFields(), description: tooLongEvenTrimmed }).description).toBeTruthy();
  });
});

describe("validateApplication: the logo (logoUrl)", () => {
  it("is optional: absent, null or empty gives no error", () => {
    expect(validateApplication(validFields())).toEqual({});
    expect(validateApplication({ ...validFields(), logoUrl: null })).toEqual({});
    expect(validateApplication({ ...validFields(), logoUrl: "" })).toEqual({});
  });

  it("is not judged here (storage is checked server-side), whatever the value", () => {
    for (const logoUrl of [
      "https://proj.supabase.co/storage/v1/object/public/media/partner-logos/applicants/u1/logo.webp",
      "https://evil.example/logo.png",
      "not a url",
    ]) {
      expect(validateApplication({ ...validFields(), logoUrl }).logoUrl).toBeUndefined();
    }
  });
});

describe("APPLICATION_FIELD_LABELS", () => {
  const keys = APPLICATION_FIELD_LABELS.map(([key]) => key as string);

  it("labels every questionnaire field Staff read, including the public write-up", () => {
    expect(new Set(keys)).toEqual(
      new Set([
        "companyName",
        "uen",
        "website",
        "category",
        "contactName",
        "contactMobile",
        "businessEmail",
        "introPlan",
        "description",
      ]),
    );
  });

  it("does not list the logo (it is shown as an image)", () => {
    expect(keys).not.toContain("logoUrl");
  });

  it("lists each field once, each with a non-empty label", () => {
    expect(new Set(keys).size).toBe(keys.length);
    for (const [key, label] of APPLICATION_FIELD_LABELS) {
      expect(typeof label, `label for ${key}`).toBe("string");
      expect(label.trim(), `label for ${key}`).not.toBe("");
    }
  });
});

describe("canWithdrawApplication", () => {
  it("allows a pending application that is not linked to a partner", () => {
    expect(canWithdrawApplication("pending", null)).toBe(true);
    expect(canWithdrawApplication("pending", undefined)).toBe(true);
    expect(canWithdrawApplication("pending", "")).toBe(true);
  });

  it("refuses a pending application already linked to a partner row", () => {
    expect(canWithdrawApplication("pending", "11111111-1111-4111-8111-111111111111")).toBe(false);
  });

  it("refuses approved and rejected applications, linked or not", () => {
    for (const status of ["approved", "rejected"] as const) {
      expect(canWithdrawApplication(status, null)).toBe(false);
      expect(canWithdrawApplication(status, undefined)).toBe(false);
      expect(canWithdrawApplication(status, "")).toBe(false);
      expect(canWithdrawApplication(status, "11111111-1111-4111-8111-111111111111")).toBe(false);
    }
  });

  it("is true for exactly one status (withdrawing is not itself a status)", () => {
    const withdrawable = ALL_STATUSES.filter((s) => canWithdrawApplication(s, null));
    expect(withdrawable).toEqual(["pending"]);
  });
});
