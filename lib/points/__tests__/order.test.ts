import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { orderEarnLine, pointsUsedRow, readOrderPoints, splitOrderDiscount, type OrderPointsRow } from "../order";

const LIVE = { points_enabled: "true", points_launch_at: "2026-11-01T00:00:00.000Z" };

function fakeAdmin(world: {
  settings?: Record<string, string>;
  earned?: { points: number } | null;
  candidate?: { points: number; release_at: string | null } | null;
  partner?: boolean;
}) {
  const reads: string[] = [];
  return {
    reads,
    admin: {
      from(table: string) {
        reads.push(table);
        const rows = {
          site_settings: Object.entries(world.settings ?? LIVE).map(([key, value]) => ({ key, value })),
        } as Record<string, unknown>;
        const b = {
          select: () => b,
          eq: () => b,
          in: async () => ({ data: rows[table] ?? [], error: null }),
          maybeSingle: async () => ({
            data: table === "points_ledger" ? (world.earned ?? null) : (world.candidate ?? null),
            error: null,
          }),
        };
        return b;
      },
      rpc: async () => ({ data: world.partner ?? false, error: null }),
    } as unknown as SupabaseClient,
  };
}

const ORDER: OrderPointsRow = {
  id: "o1",
  customer_id: "c1",
  paid_at: "2026-11-05T02:00:00.000Z",
  subtotal: 120,
  discount_amount: 20,
  amount_refunded: 0,
  points_spent: 1000,
};

describe("readOrderPoints", () => {
  it("pending, then earned", async () => {
    const pending = fakeAdmin({ candidate: { points: 300, release_at: "2026-12-10T02:00:00.000Z" } });
    expect(await readOrderPoints(pending.admin, ORDER)).toEqual({
      spent: 1000,
      earn: { kind: "pending", points: 300, releaseAt: "2026-12-10T02:00:00.000Z" },
    });
    const earned = fakeAdmin({ earned: { points: 300 }, candidate: null });
    expect((await readOrderPoints(earned.admin, ORDER)).earn).toEqual({ kind: "earned", points: 300 });
  });

  it("refunded to nothing before release; a partner's is not called refunded", async () => {
    const refunded = { ...ORDER, amount_refunded: 100 };
    expect((await readOrderPoints(fakeAdmin({}).admin, refunded)).earn).toEqual({ kind: "refunded" });
    expect((await readOrderPoints(fakeAdmin({ partner: true }).admin, refunded)).earn).toBeNull();
  });

  it("earns nothing while points are off, before launch, or with no Customer; what was spent still shows", async () => {
    const off = fakeAdmin({ settings: { points_enabled: "false" } });
    expect(await readOrderPoints(off.admin, ORDER)).toEqual({ spent: 1000, earn: null });
    expect(off.reads).toEqual(["site_settings"]);
    const early = fakeAdmin({ candidate: { points: 300, release_at: null } });
    expect((await readOrderPoints(early.admin, { ...ORDER, paid_at: "2026-10-30T00:00:00.000Z" })).earn).toBeNull();
    const guest = fakeAdmin({});
    expect(await readOrderPoints(guest.admin, { ...ORDER, customer_id: null })).toEqual({ spent: 1000, earn: null });
    expect(guest.reads).toEqual([]);
  });
});

describe("the lines", () => {
  it("say what the order earns, earned, or lost to a refund", () => {
    expect(orderEarnLine({ kind: "pending", points: 300, releaseAt: "2026-12-10T02:00:00.000Z" })).toBe(
      "Earns 300 points (S$3.00), usable from 10 Dec 2026",
    );
    expect(orderEarnLine({ kind: "pending", points: 300, releaseAt: null })).toBe("Earns 300 points (S$3.00), usable 30 days after delivery");
    expect(orderEarnLine({ kind: "earned", points: 1233 })).toBe("Earned 1,233 points (S$12.33)");
    expect(orderEarnLine({ kind: "refunded" })).toBe("Points not earned: refunded");
  });

  it("put points used on their own line", () => {
    expect(pointsUsedRow(2000)).toEqual({ label: "Points used (2,000)", dollars: 20 });
    expect(pointsUsedRow(0)).toBeNull();
  });

  it("split discount_amount into the code and the points, so points never show as a code", () => {
    expect(splitOrderDiscount(10, 1000)).toEqual({ discount: 0, pointsUsed: { label: "Points used (1,000)", dollars: 10 } });
    expect(splitOrderDiscount(25, 1000)).toEqual({ discount: 15, pointsUsed: { label: "Points used (1,000)", dollars: 10 } });
    expect(splitOrderDiscount(12.5, 0)).toEqual({ discount: 12.5, pointsUsed: null });
    expect(splitOrderDiscount(12.5, null)).toEqual({ discount: 12.5, pointsUsed: null });
    expect(splitOrderDiscount(19.99, 700).discount).toBe(12.99);
  });
});
