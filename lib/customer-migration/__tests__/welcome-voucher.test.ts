import { describe, expect, it } from "vitest";
import {
  usableWelcomeVoucherCard,
  welcomeVoucherCard,
  welcomeVoucherState,
  welcomeVoucherSummaryFromRow,
  type WelcomeVoucherRow,
} from "@/lib/customer-migration/welcome-voucher";
import {
  parseWelcomeVoucherTerms,
  singaporeDay,
  welcomeVoucherIssuing,
  welcomeVoucherTermsSchema,
  welcomeVoucherTermsToStored,
  type WelcomeVoucherTerms,
} from "@/lib/customer-migration/welcome-voucher-terms";

/**
 * The Welcome-back voucher's surfaces (migration slice 06): its state, the
 * card a signed-in Customer sees, the Discounts card's figures, and the terms
 * the owner sets (decision 2), read and written exactly as the SQL reads them.
 */

const NOW = new Date("2026-10-21T04:00:00Z");

const voucher = (over: Partial<WelcomeVoucherRow> = {}): WelcomeVoucherRow => ({
  code: "WB-ABCDEFGHJK",
  discount_type: "fixed_amount",
  discount_value: 20,
  currency: "SGD",
  min_order_amount: 60,
  expires_at: "2026-12-20T03:00:00Z",
  usage_count: 0,
  is_active: true,
  ...over,
});

describe("welcomeVoucherState", () => {
  it("is none, issued, used or expired, by the same rule as welcome_voucher_state()", () => {
    expect(welcomeVoucherState(null, NOW)).toBe("none");
    expect(welcomeVoucherState(voucher(), NOW)).toBe("issued");
    expect(welcomeVoucherState(voucher({ usage_count: 1 }), NOW)).toBe("used");
    expect(welcomeVoucherState(voucher({ expires_at: "2026-10-21T04:00:00Z" }), NOW)).toBe("expired");
    expect(welcomeVoucherState(voucher({ is_active: false }), NOW)).toBe("expired");
    expect(welcomeVoucherState(voucher({ expires_at: null }), NOW)).toBe("issued");
  });

  it("calls a used voucher used, even once it has passed its expiry", () => {
    expect(welcomeVoucherState(voucher({ usage_count: 1, expires_at: "2026-01-01T00:00:00Z" }), NOW)).toBe("used");
  });
});

describe("the voucher card", () => {
  it("shows the code, the value, the minimum spend and the Singapore expiry day", () => {
    const card = welcomeVoucherCard(voucher({ expires_at: "2026-12-20T17:00:00Z" }));
    expect(card.code).toBe("WB-ABCDEFGHJK");
    expect(card.worth).toMatch(/20\.00 off$/);
    expect(card.minimum).toMatch(/60\.00$/);
    // 17:00 UTC is 01:00 the next day in Singapore.
    expect(card.expiresOn).toBe("21 December 2026");
  });

  it("says Free shipping, and no minimum for none", () => {
    const card = welcomeVoucherCard(voucher({ discount_type: "free_shipping", discount_value: 1, min_order_amount: null }));
    expect(card.worth).toBe("Free shipping");
    expect(card.minimum).toBeNull();
  });

  it("is shown only while the voucher is unused and unexpired", () => {
    expect(usableWelcomeVoucherCard(voucher(), NOW)).not.toBeNull();
    expect(usableWelcomeVoucherCard(voucher({ usage_count: 1 }), NOW)).toBeNull();
    expect(usableWelcomeVoucherCard(voucher({ expires_at: "2026-10-01T00:00:00Z" }), NOW)).toBeNull();
    expect(usableWelcomeVoucherCard(null, NOW)).toBeNull();
  });
});

describe("welcomeVoucherSummaryFromRow", () => {
  it("reads counts and sums that arrive as strings", () => {
    expect(
      welcomeVoucherSummaryFromRow({
        issued: "10",
        redeemed: "3",
        outstanding: "5",
        expired: "2",
        free_shipping: "0",
        value_issued: "200.00",
        value_outstanding: "100.00",
        value_redeemed: "60.00",
      }),
    ).toEqual({
      issued: 10,
      redeemed: 3,
      outstanding: 5,
      expired: 2,
      freeShipping: 0,
      valueIssued: 200,
      valueOutstanding: 100,
      valueRedeemed: 60,
    });
    expect(welcomeVoucherSummaryFromRow(null).issued).toBe(0);
  });
});

describe("the terms", () => {
  const terms: WelcomeVoucherTerms = {
    enabled: true,
    type: "fixed_amount",
    value: 20,
    minOrder: 60,
    validDays: 60,
    issueUntil: "2026-12-31",
  };

  it("reads the seeded defaults as off, valid 60 days, nothing else set", () => {
    expect(parseWelcomeVoucherTerms({ welcome_voucher_enabled: "false", welcome_voucher_valid_days: "60" })).toEqual({
      terms: { enabled: false, type: null, value: null, minOrder: null, validDays: 60, issueUntil: null },
      malformed: [],
    });
    expect(parseWelcomeVoucherTerms({}).terms.validDays).toBe(60);
  });

  it("round-trips through the six stored strings", () => {
    const stored = welcomeVoucherTermsToStored(terms);
    expect(stored).toEqual({
      welcome_voucher_enabled: "true",
      welcome_voucher_type: "fixed_amount",
      welcome_voucher_value: "20",
      welcome_voucher_min_order: "60",
      welcome_voucher_valid_days: "60",
      welcome_voucher_issue_until: "2026-12-31",
    });
    expect(parseWelcomeVoucherTerms(stored)).toEqual({ terms, malformed: [] });
  });

  it("stores no value for free shipping, and blank for no minimum", () => {
    const stored = welcomeVoucherTermsToStored({ ...terms, type: "free_shipping", minOrder: null });
    expect(stored.welcome_voucher_value).toBe("");
    expect(stored.welcome_voucher_min_order).toBe("");
  });

  it("names a stored value the SQL could not read", () => {
    const { malformed } = parseWelcomeVoucherTerms({
      welcome_voucher_enabled: "true",
      welcome_voucher_value: "twenty",
      welcome_voucher_valid_days: "6.5",
      welcome_voucher_issue_until: "2026-02-30",
    });
    expect(malformed.sort()).toEqual(["welcome_voucher_issue_until", "welcome_voucher_valid_days", "welcome_voucher_value"]);
  });

  it("says whether a Claim now would issue, in the SQL's order", () => {
    const at = (t: Partial<WelcomeVoucherTerms>, malformed: string[] = []) =>
      welcomeVoucherIssuing({ terms: { ...terms, ...t }, malformed: malformed as never }, NOW);
    expect(at({})).toEqual({ issuing: true, until: "2026-12-31" });
    expect(at({ enabled: false })).toEqual({ issuing: false, reason: "off" });
    expect(at({}, ["welcome_voucher_value"])).toEqual({ issuing: false, reason: "malformed" });
    expect(at({ type: null })).toEqual({ issuing: false, reason: "no_type" });
    expect(at({ value: null })).toEqual({ issuing: false, reason: "no_value" });
    expect(at({ type: "free_shipping", value: null })).toEqual({ issuing: true, until: "2026-12-31" });
    expect(at({ issueUntil: null })).toEqual({ issuing: false, reason: "no_issue_until" });
    // Issue-until is a Singapore day, inclusive.
    expect(at({ issueUntil: "2026-10-21" })).toEqual({ issuing: true, until: "2026-10-21" });
    expect(at({ issueUntil: "2026-10-20" })).toEqual({ issuing: false, reason: "ended" });
  });

  it("reads Singapore's day, not the server's", () => {
    expect(singaporeDay(new Date("2026-10-20T16:30:00Z"))).toBe("2026-10-21");
    expect(singaporeDay(new Date("2026-10-20T15:59:00Z"))).toBe("2026-10-20");
  });

  it("refuses to turn issuing on with incomplete terms, and accepts it off with nothing set", () => {
    const off = { enabled: false, type: null, value: null, minOrder: null, validDays: 60, issueUntil: null };
    expect(welcomeVoucherTermsSchema.safeParse(off).success).toBe(true);
    expect(welcomeVoucherTermsSchema.safeParse(terms).success).toBe(true);
    for (const bad of [
      { ...terms, type: null },
      { ...terms, value: null },
      { ...terms, issueUntil: null },
      { ...terms, value: -5 },
      { ...terms, validDays: 0 },
      { ...terms, issueUntil: "2026-02-30" },
      { ...terms, scope: "accessories" },
    ]) {
      expect(welcomeVoucherTermsSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
