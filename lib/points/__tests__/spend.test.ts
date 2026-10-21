import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mayUseBoundCoupon } from "@/lib/ecommerce/discounts";
import {
  RESERVE_OUTCOMES,
  formatPointsUsed,
  mayUseAccountValue,
  pointsAllowance,
  pointsCapDollars,
  releasePoints,
  releaseStalePointReservations,
  reservePoints,
  validatePointsRequest,
  withPointsLabel,
} from "../spend";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261021140000_points_spending.sql"), "utf8");

const rules = { minRedeem: 500, maxShare: 0.5 };

describe("the allowance (rule i)", () => {
  it("is the smaller of the balance and half the products after the coupon, in S$1 steps", () => {
    // Half of S$90 is S$45: the cap, under a 6,000-point balance.
    expect(pointsAllowance({ available: 6000, productsAfterCoupon: 90, ...rules })).toBe(4500);
    // A balance of 2,130 spends 2,100: the odd 30 stay.
    expect(pointsAllowance({ available: 2130, productsAfterCoupon: 200, ...rules })).toBe(2100);
    // Half of S$85.50 is S$42.75: whole dollars only.
    expect(pointsAllowance({ available: 10000, productsAfterCoupon: 85.5, ...rules })).toBe(4200);
  });

  it("is null when the order or the balance cannot reach the minimum", () => {
    expect(pointsAllowance({ available: 10000, productsAfterCoupon: 9, ...rules })).toBeNull();
    expect(pointsAllowance({ available: 499, productsAfterCoupon: 200, ...rules })).toBeNull();
    expect(pointsAllowance({ available: 0, productsAfterCoupon: 200, ...rules })).toBeNull();
    expect(pointsAllowance({ available: 10000, productsAfterCoupon: 0, ...rules })).toBeNull();
    expect(pointsAllowance({ available: 500, productsAfterCoupon: 10, ...rules })).toBe(500);
  });

  it("never pays the whole of the products, whatever the share: every Order takes some cash", () => {
    expect(pointsCapDollars(20, 1)).toBe(19);
    expect(pointsCapDollars(20.5, 1)).toBe(20);
    expect(pointsCapDollars(0.5, 1)).toBe(0);
  });

  it("does not lose a dollar to binary drift", () => {
    // 0.29 × 100 is 28.999999999999996 in floating point.
    expect(pointsCapDollars(100, 0.29)).toBe(29);
    expect(pointsCapDollars(100, 0.7)).toBe(70);
  });
});

describe("a requested amount, as the server checks it (forged requests)", () => {
  const order = { available: 3000, productsAfterCoupon: 90, ...rules };

  it("accepts S$1 steps from the minimum to the allowance", () => {
    expect(validatePointsRequest(500, order)).toEqual({ ok: true, points: 500, discount: 5 });
    expect(validatePointsRequest(3000, order)).toEqual({ ok: true, points: 3000, discount: 30 });
  });

  it("refuses an odd step, a fraction, zero, a negative and a non-number", () => {
    for (const forged of [550, 1000.5, 0, -500, "1000", null, Number.NaN]) {
      expect(validatePointsRequest(forged, order)).toEqual({ ok: false, error: "Points are used in steps of 100 (S$1)." });
    }
  });

  it("refuses below the minimum", () => {
    expect(validatePointsRequest(400, order)).toEqual({ ok: false, error: "Use at least 500 points (S$5.00)." });
  });

  it("refuses above the cap, even with the balance to cover it", () => {
    const rich = { ...order, available: 100000 };
    expect(validatePointsRequest(4600, rich)).toEqual({ ok: false, error: "This order can take at most 4,500 points (S$45.00)." });
    expect(validatePointsRequest(500, { ...rich, productsAfterCoupon: 0 })).toEqual({
      ok: false,
      error: "This order is too small to use points.",
    });
  });

  it("refuses above the balance", () => {
    expect(validatePointsRequest(3100, order)).toEqual({ ok: false, error: "You have 3,000 points (S$30.00) to use." });
  });
});

describe("whose points (rule h)", () => {
  const OWNER = "owner";
  const OTHER = "other";
  const use = (sessionCustomerId: string | null, emailCustomerId: string | null) =>
    mayUseAccountValue(sessionCustomerId, { sessionCustomerId, emailCustomerId });

  it("refuses a guest, another Customer, and the owner under another email", () => {
    expect(use(null, OWNER)).toBe(false);
    expect(use(null, null)).toBe(false);
    expect(use(OTHER, OWNER)).toBe(false);
    expect(use(OWNER, OTHER)).toBe(false);
    expect(use(OWNER, null)).toBe(false);
  });

  it("accepts the owner checking out with their own email", () => {
    expect(use(OWNER, OWNER)).toBe(true);
  });

  it("is the bound-voucher rule, for value that always has an owner", () => {
    for (const [session, email] of [
      [OWNER, OWNER],
      [OWNER, OTHER],
      [OTHER, OWNER],
      [null, OWNER],
    ] as const) {
      const holder = { sessionCustomerId: session, emailCustomerId: email };
      expect(mayUseAccountValue(OWNER, holder)).toBe(mayUseBoundCoupon(OWNER, holder));
    }
    expect(mayUseAccountValue(null, { sessionCustomerId: null, emailCustomerId: null })).toBe(false);
  });
});

describe("labels", () => {
  it("names the Stripe coupon with the points", () => {
    expect(withPointsLabel("SAVE10")).toBe("SAVE10 + Points");
    expect(withPointsLabel(null)).toBe("Points");
  });

  it("shows the points used as their own line", () => {
    expect(formatPointsUsed(2000)).toBe("Points used: 2,000 (−S$20.00)");
  });
});

const rpcClient = (rpc: (fn: string, args: unknown) => unknown) => ({ rpc: vi.fn(rpc) }) as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> };

describe("the wrappers never throw", () => {
  it("reservePoints passes the SQL outcome through, and anything else is an error", async () => {
    const ok = rpcClient(async () => ({ data: "insufficient", error: null }));
    expect(await reservePoints(ok, { customerId: "c", orderId: "o", points: 500 })).toBe("insufficient");
    expect(ok.rpc).toHaveBeenCalledWith("reserve_points", { p_customer_id: "c", p_order_id: "o", p_points: 500 });

    const odd = rpcClient(async () => ({ data: "maybe", error: null }));
    expect(await reservePoints(odd, { customerId: "c", orderId: "o", points: 500 })).toBe("error");
    const failed = rpcClient(async () => ({ data: null, error: { message: "boom" } }));
    expect(await reservePoints(failed, { customerId: "c", orderId: "o", points: 500 })).toBe("error");
    const thrown = rpcClient(async () => {
      throw new Error("network");
    });
    expect(await reservePoints(thrown, { customerId: "c", orderId: "o", points: 500 })).toBe("error");
  });

  it("releasePoints says whether it wrote, and reports a failure", async () => {
    expect(await releasePoints(rpcClient(async () => ({ data: true, error: null })), "o")).toEqual({ ok: true, released: true });
    expect(await releasePoints(rpcClient(async () => ({ data: false, error: null })), "o")).toEqual({ ok: true, released: false });
    expect(await releasePoints(rpcClient(async () => ({ data: null, error: { message: "boom" } })), "o")).toEqual({
      ok: false,
      error: "boom",
    });
  });

  it("the sweep passes its clock and reports how many it released", async () => {
    const client = rpcClient(async () => ({ data: 3, error: null }));
    const now = new Date("2026-11-02T01:00:00.000Z");
    expect(await releaseStalePointReservations(client, now)).toEqual({ ok: true, released: 3 });
    expect(client.rpc).toHaveBeenCalledWith("release_stale_point_reservations", { p_now: "2026-11-02T01:00:00.000Z" });
    const failed = await releaseStalePointReservations(rpcClient(async () => ({ data: null, error: { message: "boom" } })));
    expect(failed).toEqual({ ok: false, error: "Could not release stale point reservations: boom" });
  });
});

describe("parity with 20261021140000_points_spending.sql", () => {
  it("knows every outcome reserve_points returns", () => {
    const body = MIGRATION.slice(MIGRATION.indexOf("function public.reserve_points"), MIGRATION.indexOf("function public.release_points"));
    const returned = new Set([...body.matchAll(/return '([a-z_]+)';/g)].map((m) => m[1]));
    expect([...returned].sort()).toEqual([...RESERVE_OUTCOMES].sort());
  });

  it("caps as the allowance does: the share floored to a dollar, and never the whole", () => {
    expect(MIGRATION).toContain("least(floor(s.max_share * v_base), ceil(v_base) - 1)");
  });
});
