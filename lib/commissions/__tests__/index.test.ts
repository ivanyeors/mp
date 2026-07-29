import { describe, it, expect } from "vitest";
import {
  resolveScheme,
  computeCommission,
  releaseAt,
  effectiveCommissionStatus,
  summarizeCommissionTotals,
  round2,
  COMMISSION_RELEASE_WINDOW_DAYS,
  type CommissionScheme,
} from "@/lib/commissions";

const DAY = 24 * 60 * 60 * 1000;

const scheme = (
  partner_id: string | null,
  product_type: "pillow" | "bolster",
  kind: "flat" | "percent",
  amount: number,
): CommissionScheme => ({ partner_id, product_type, kind, amount });

describe("resolveScheme — per-partner override wins, else DEFAULT, else null", () => {
  const pillowDefault = scheme(null, "pillow", "percent", 10);
  const pillowOverride = scheme("p1", "pillow", "flat", 5);
  const bolsterDefault = scheme(null, "bolster", "percent", 8);
  const all = [pillowDefault, pillowOverride, bolsterDefault];

  it("per-partner OVERRIDE beats the DEFAULT", () => {
    expect(resolveScheme(all, "p1", "pillow")).toBe(pillowOverride);
  });
  it("DEFAULT used when the partner has no override", () => {
    expect(resolveScheme(all, "p2", "pillow")).toBe(pillowDefault);
  });
  it("null when neither override nor default exists for the type", () => {
    expect(resolveScheme([pillowDefault], "p1", "bolster")).toBeNull();
    expect(resolveScheme([], "p1", "pillow")).toBeNull();
  });
  it("product-type scoping: a pillow scheme is never used for bolster", () => {
    // p1 has a pillow override but NO bolster override → bolster falls to the bolster default.
    expect(resolveScheme(all, "p1", "bolster")).toBe(bolsterDefault);
    // And a pillow-only set yields nothing for bolster.
    expect(resolveScheme([pillowDefault, pillowOverride], "p1", "bolster")).toBeNull();
  });
});

describe("computeCommission — percent = %×base, flat = amount×qty, cents-exact", () => {
  it("percent uses the per-LINE base (quantity already folded in)", () => {
    // baseAmount is per-unit base × qty; percent ignores the qty arg.
    expect(computeCommission(100, 2, scheme(null, "pillow", "percent", 10))).toBe(10);
    expect(computeCommission(250, 99, scheme(null, "pillow", "percent", 20))).toBe(50);
  });
  it("flat = amount per UNIT × quantity (base ignored)", () => {
    expect(computeCommission(9999, 3, scheme(null, "pillow", "flat", 5))).toBe(15);
    expect(computeCommission(0, 4, scheme(null, "bolster", "flat", 2.5))).toBe(10);
  });
  it("rounds to cents (no float dust)", () => {
    // 33% of 10.10 = 3.333 → 3.33
    expect(computeCommission(10.1, 1, scheme(null, "pillow", "percent", 33))).toBe(3.33);
    // 15% of 33.33 = 4.9995 → 5.00
    expect(computeCommission(33.33, 1, scheme(null, "pillow", "percent", 15))).toBe(5);
  });
  it("zero and large values", () => {
    expect(computeCommission(0, 0, scheme(null, "pillow", "percent", 10))).toBe(0);
    expect(computeCommission(0, 5, scheme(null, "pillow", "flat", 0))).toBe(0);
    expect(computeCommission(1_000_000, 1, scheme(null, "pillow", "percent", 15))).toBe(150000);
  });

  it("round2 helper is cents-exact", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe("releaseAt — delivered_at + window, NEVER paid_at (ADR 0015 §2)", () => {
  it("default window constant matches the RMA return window (30)", () => {
    expect(COMMISSION_RELEASE_WINDOW_DAYS).toBe(30);
  });
  it("delivered_at + window days", () => {
    const ra = releaseAt("2026-01-01T00:00:00.000Z", 30);
    expect(ra?.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });
  it("honours a custom window", () => {
    const ra = releaseAt("2026-01-01T00:00:00.000Z", 7);
    expect(ra?.getTime()).toBe(new Date("2026-01-01T00:00:00.000Z").getTime() + 7 * DAY);
  });
  it("null / undefined deliveredAt → null (not yet delivered)", () => {
    expect(releaseAt(null)).toBeNull();
    expect(releaseAt(undefined)).toBeNull();
  });
});

describe("effectiveCommissionStatus — derive-on-read from delivery", () => {
  const delivered = "2026-01-01T00:00:00.000Z";
  const release = new Date("2026-01-31T00:00:00.000Z"); // delivered + 30d

  it("held → released exactly at delivered_at + window (day boundary INCLUDED)", () => {
    expect(effectiveCommissionStatus({ status: "held", delivered_at: delivered }, release)).toBe(
      "released",
    );
  });
  it("held stays held 1ms before the boundary", () => {
    const justBefore = new Date(release.getTime() - 1);
    expect(effectiveCommissionStatus({ status: "held", delivered_at: delivered }, justBefore)).toBe(
      "held",
    );
  });
  it("held with NULL delivered_at stays held (release derives from delivered_at only)", () => {
    const farFuture = new Date("2030-01-01T00:00:00.000Z");
    expect(effectiveCommissionStatus({ status: "held", delivered_at: null }, farFuture)).toBe("held");
  });

  it("void is TERMINAL — never re-derived even long past the window", () => {
    const farFuture = new Date("2030-01-01T00:00:00.000Z");
    expect(effectiveCommissionStatus({ status: "void", delivered_at: delivered }, farFuture)).toBe(
      "void",
    );
  });
  it("paid is TERMINAL — never re-derived from delivery/paid_at", () => {
    const farFuture = new Date("2030-01-01T00:00:00.000Z");
    expect(effectiveCommissionStatus({ status: "paid", delivered_at: delivered }, farFuture)).toBe(
      "paid",
    );
  });
  it("released stays released", () => {
    expect(effectiveCommissionStatus({ status: "released", delivered_at: null }, release)).toBe(
      "released",
    );
  });

  // Lifecycle held → released → paid | void, plus the RMA-resolution mapping.
  // The pure module expresses resolutions ONLY as terminal status: a refund resolution
  // is persisted as `void` (stays void above); exchange/replacement KEEP the row, so it
  // continues to derive held→released normally. The refund→void / exchange-keep WIRING
  // itself is integration (lib/commissions/ledger.ts voidCommissionsForRma).
  it("an exchange/replacement (kept) row still matures held→released", () => {
    expect(effectiveCommissionStatus({ status: "held", delivered_at: delivered }, release)).toBe(
      "released",
    );
  });
});

describe("summarizeCommissionTotals — cents-summed buckets, void excluded", () => {
  it("buckets held / released(unpaid) / paid; allTime excludes void", () => {
    const totals = summarizeCommissionTotals([
      { status: "held", commission_amount: 10 },
      { status: "released", commission_amount: 20, payout_id: null },
      { status: "paid", commission_amount: 30, payout_id: "po1" },
      { status: "void", commission_amount: 999 },
    ]);
    expect(totals).toEqual({ held: 10, released: 20, paid: 30, allTime: 60 });
  });

  it("released rows already assigned to a payout are NOT counted as the payable balance", () => {
    const totals = summarizeCommissionTotals([
      { status: "released", commission_amount: 40, payout_id: "po7" },
    ]);
    expect(totals.released).toBe(0); // not payable — already on a payout
    expect(totals.allTime).toBe(40); // but still earned
  });

  it("sums in cents — no float dust", () => {
    const totals = summarizeCommissionTotals([
      { status: "held", commission_amount: 0.1 },
      { status: "held", commission_amount: 0.2 },
    ]);
    expect(totals.held).toBe(0.3);
    expect(totals.allTime).toBe(0.3);
  });

  it("accepts string amounts (DB numeric)", () => {
    const totals = summarizeCommissionTotals([
      { status: "held", commission_amount: "12.50" },
      { status: "paid", commission_amount: "7.25", payout_id: "po1" },
    ]);
    expect(totals.held).toBe(12.5);
    expect(totals.paid).toBe(7.25);
    expect(totals.allTime).toBe(19.75);
  });

  it("empty input → all zeros", () => {
    expect(summarizeCommissionTotals([])).toEqual({ held: 0, released: 0, paid: 0, allTime: 0 });
  });
});
