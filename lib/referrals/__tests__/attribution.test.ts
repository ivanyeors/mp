import { describe, it, expect } from "vitest";
import {
  resolveAttribution,
  isWithinReferralWindow,
  normalizeReferralCode,
  isValidReferralCodeFormat,
  generateReferralCode,
  REFERRAL_WINDOW_DAYS,
} from "@/lib/referrals/attribution";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-07-27T00:00:00.000Z");
const agoIso = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("resolveAttribution — one Referral per Order, closer wins (ADR 0015 §1)", () => {
  it("assist alone → assist", () => {
    expect(resolveAttribution({ assistPartnerId: "A" })).toEqual({ partnerId: "A", source: "assist" });
  });
  it("typed alone → typed", () => {
    expect(resolveAttribution({ typedPartnerId: "T" })).toEqual({ partnerId: "T", source: "typed" });
  });
  it("link alone → link", () => {
    expect(resolveAttribution({ linkPartnerId: "L" })).toEqual({ partnerId: "L", source: "link" });
  });

  it("assist > typed", () => {
    expect(resolveAttribution({ assistPartnerId: "A", typedPartnerId: "T" })).toEqual({
      partnerId: "A",
      source: "assist",
    });
  });
  it("assist > link", () => {
    expect(resolveAttribution({ assistPartnerId: "A", linkPartnerId: "L" })).toEqual({
      partnerId: "A",
      source: "assist",
    });
  });
  it("typed > link", () => {
    expect(resolveAttribution({ typedPartnerId: "T", linkPartnerId: "L" })).toEqual({
      partnerId: "T",
      source: "typed",
    });
  });
  it("assist > typed > link (all three present) → assist", () => {
    expect(
      resolveAttribution({ assistPartnerId: "A", typedPartnerId: "T", linkPartnerId: "L" }),
    ).toEqual({ partnerId: "A", source: "assist" });
  });

  it("all-null → {null, null}", () => {
    expect(resolveAttribution({})).toEqual({ partnerId: null, source: null });
    expect(
      resolveAttribution({ assistPartnerId: null, typedPartnerId: null, linkPartnerId: null }),
    ).toEqual({ partnerId: null, source: null });
  });

  it("never merges channels — exactly one winner is returned", () => {
    const r = resolveAttribution({ assistPartnerId: "A", typedPartnerId: "T", linkPartnerId: "L" });
    expect(r.partnerId).toBe("A");
    expect(["assist", "typed", "link", null]).toContain(r.source);
  });
});

describe("isWithinReferralWindow — 30-day link window (ADR 0015 §1)", () => {
  it("default window constant is 30", () => {
    expect(REFERRAL_WINDOW_DAYS).toBe(30);
  });

  it("day-30 boundary is INCLUDED", () => {
    expect(isWithinReferralWindow(agoIso(30 * DAY), NOW)).toBe(true);
  });
  it("1ms past day-30 is EXCLUDED", () => {
    expect(isWithinReferralWindow(agoIso(30 * DAY + 1), NOW)).toBe(false);
  });
  it("day-31 is EXCLUDED", () => {
    expect(isWithinReferralWindow(agoIso(31 * DAY), NOW)).toBe(false);
  });
  it("stamped exactly now (age 0) is INCLUDED", () => {
    expect(isWithinReferralWindow(NOW.toISOString(), NOW)).toBe(true);
  });

  it("FUTURE stamp → false (clock skew / forged; the landed fix)", () => {
    expect(isWithinReferralWindow(new Date(NOW.getTime() + DAY).toISOString(), NOW)).toBe(false);
  });

  it("null / undefined / unparseable → false", () => {
    expect(isWithinReferralWindow(null, NOW)).toBe(false);
    expect(isWithinReferralWindow(undefined, NOW)).toBe(false);
    expect(isWithinReferralWindow("", NOW)).toBe(false);
    expect(isWithinReferralWindow("not-a-date", NOW)).toBe(false);
  });

  it("honours a custom window (days=7): day-7 in, day-8 out", () => {
    expect(isWithinReferralWindow(agoIso(7 * DAY), NOW, 7)).toBe(true);
    expect(isWithinReferralWindow(agoIso(8 * DAY), NOW, 7)).toBe(false);
  });
});

describe("referral code format", () => {
  it("normalizeReferralCode trims + uppercases", () => {
    expect(normalizeReferralCode("  ab12cd  ")).toBe("AB12CD");
    expect(normalizeReferralCode("abc123")).toBe("ABC123");
  });

  it("isValidReferralCodeFormat: valid 6–12 alnum (case-insensitive)", () => {
    expect(isValidReferralCodeFormat("ABC123")).toBe(true);
    expect(isValidReferralCodeFormat("abc123")).toBe(true);
    expect(isValidReferralCodeFormat("ABCDEF123456")).toBe(true);
  });

  it("isValidReferralCodeFormat: rejects too-short / too-long / symbols / empty / spaces", () => {
    expect(isValidReferralCodeFormat("ABC12")).toBe(false);
    expect(isValidReferralCodeFormat("ABCDEF1234567")).toBe(false);
    expect(isValidReferralCodeFormat("ABC-12")).toBe(false);
    expect(isValidReferralCodeFormat("")).toBe(false);
    expect(isValidReferralCodeFormat("AB C123")).toBe(false);
  });
});

describe("generateReferralCode — format only, never a fixed value", () => {
  it("defaults to length 8", () => {
    expect(generateReferralCode()).toHaveLength(8);
  });
  it("honours a requested length", () => {
    expect(generateReferralCode(10)).toHaveLength(10);
  });
  it("uses only the unambiguous alphabet (no 0/O/1/I/L) across many draws", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode(12);
      expect(code).toMatch(/^[A-Z0-9]{12}$/);
      expect(code).not.toMatch(/[01OIL]/);
      expect(isValidReferralCodeFormat(code)).toBe(true);
    }
  });
});
