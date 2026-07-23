import { describe, it, expect } from "vitest";
import { evaluateEligibility, type EligibilityInput } from "@/lib/rma/eligibility";

const NOW = new Date("2026-07-23T12:00:00Z");

function base(overrides: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    order: { delivered_at: "2026-07-20T00:00:00Z", status: "delivered" },
    item: { quantity: 2 },
    alreadyReturnedQty: 0,
    requestedQty: 1,
    returnWindowDays: 30,
    now: NOW,
    ...overrides,
  };
}

describe("evaluateEligibility", () => {
  it("accepts a delivered, in-window line with available quantity", () => {
    const r = evaluateEligibility(base());
    expect(r.eligible).toBe(true);
    expect(r.availableQty).toBe(2);
  });

  it("rejects an undelivered order", () => {
    const r = evaluateEligibility(base({ order: { delivered_at: null, status: "processing" } }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/delivered/i);
  });

  it("rejects a fully refunded order", () => {
    const r = evaluateEligibility(
      base({ order: { delivered_at: "2026-07-20T00:00:00Z", status: "refunded" } }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/refunded/i);
  });

  it("rejects past the return window", () => {
    // delivered 40 days before now, 30-day window
    const r = evaluateEligibility(
      base({ order: { delivered_at: "2026-06-13T00:00:00Z", status: "delivered" } }),
    );
    expect(r.eligible).toBe(false);
    expect(r.reason).toMatch(/window closed/i);
  });

  it("accepts on the last day of the window", () => {
    // delivered exactly 30 days before now
    const r = evaluateEligibility(
      base({ order: { delivered_at: "2026-06-23T12:00:00Z", status: "delivered" } }),
    );
    expect(r.eligible).toBe(true);
  });

  it("caps available quantity by what is already in a return", () => {
    const r = evaluateEligibility(base({ item: { quantity: 3 }, alreadyReturnedQty: 3 }));
    expect(r.eligible).toBe(false);
    expect(r.availableQty).toBe(0);
    expect(r.reason).toMatch(/already part of a return/i);
  });

  it("rejects requesting more than remain available", () => {
    const r = evaluateEligibility(
      base({ item: { quantity: 2 }, alreadyReturnedQty: 1, requestedQty: 2 }),
    );
    expect(r.eligible).toBe(false);
    expect(r.availableQty).toBe(1);
    expect(r.reason).toMatch(/only 1/i);
  });

  it("defaults requestedQty to 1 for the UI eligibility check", () => {
    const r = evaluateEligibility(base({ requestedQty: undefined }));
    expect(r.eligible).toBe(true);
  });
});
