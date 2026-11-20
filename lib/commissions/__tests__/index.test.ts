import { describe, it, expect } from "vitest";
import {
  releaseAt,
  effectiveCommissionStatus,
  summarizeCommissionTotals,
  round2,
  COMMISSION_RELEASE_WINDOW_DAYS,
} from "@/lib/commissions";

const DAY = 24 * 60 * 60 * 1000;

describe("round2", () => {
  it("is cents-exact", () => {
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
  const release = new Date("2026-01-31T00:00:00.000Z");

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
    expect(totals.released).toBe(0);
    expect(totals.allTime).toBe(40);
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
