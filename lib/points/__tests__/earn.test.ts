import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { clawbackPointsForRefund, pointsForOrder, runPointsEarn, runPointsMilestones } from "../earn";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261021130000_points_earning.sql"), "utf8");

describe("pointsForOrder (rule c)", () => {
  it.each([
    ["a whole-dollar Order", { subtotal: 200, discount: 0, refunded: 0 }, 3, 600],
    ["rounds down: 3 × 33.33 = 99.99", { subtotal: 33.33, discount: 0, refunded: 0 }, 3, 99],
    ["rounds down a cent short of a point", { subtotal: 10.33, discount: 0, refunded: 0 }, 3, 30],
    ["a coupon comes off the base", { subtotal: 200, discount: 20, refunded: 0 }, 3, 540],
    ["a points-paid Order earns on its cash only", { subtotal: 120, discount: 50, refunded: 0 }, 3, 210],
    ["a partial refund comes off the base", { subtotal: 100, discount: 0, refunded: 40 }, 3, 180],
    ["a fully refunded Order earns 0", { subtotal: 100, discount: 0, refunded: 100 }, 3, 0],
    ["a base below 0 is 0", { subtotal: 50, discount: 30, refunded: 50 }, 3, 0],
    ["a service-only Order earns on its fee", { subtotal: 40, discount: 0, refunded: 0 }, 3, 120],
    ["the rate is the setting", { subtotal: 100, discount: 0, refunded: 0 }, 1, 100],
    ["a fractional rate rounds down", { subtotal: 99.99, discount: 0, refunded: 0 }, 2.5, 249],
    ["a cent-exact rate does not lose a point to floating point", { subtotal: 100, discount: 0, refunded: 0 }, 0.29, 29],
    ["a rate of 0 earns nothing", { subtotal: 100, discount: 0, refunded: 0 }, 0, 0],
  ])("%s", (_name, base, rate, expected) => {
    expect(pointsForOrder(base, rate)).toBe(expected);
  });
});

describe("the migration", () => {
  it("reads the window from points_order_candidates, never a second constant", () => {
    expect(MIGRATION).not.toMatch(/interval '\d+ days'/);
    expect(MIGRATION).toMatch(/release_at <= p_now/);
  });

  it("writes nothing while points are off, and nothing twice", () => {
    expect(MIGRATION).toMatch(/if not coalesce\(\(select enabled from points_settings\(\)\), false\) then\s+return 0;/);
    expect(MIGRATION).toMatch(/on conflict \(order_id, kind\)\s+where order_id is not null and kind in \('earn', 'spend', 'spend_release'\)\s+do nothing/);
    expect(MIGRATION).toMatch(/on conflict \(refund_id\) where kind = 'clawback' do nothing/);
  });

  it("takes the per-Customer lock adjust_points takes", () => {
    expect(MIGRATION).toMatch(/perform 1 from customers where id = v_customer for update;/);
  });

  it("is server-only", () => {
    for (const fn of ["release_earned_points(timestamptz)", "clawback_points_for_refund(uuid, text, numeric)"]) {
      expect(MIGRATION).toContain(`revoke execute on function public.${fn} from public, anon, authenticated;`);
      expect(MIGRATION).toContain(`grant execute on function public.${fn} to service_role;`);
    }
  });
});

const rpcAdmin = (rpc: (fn: string, args: unknown) => unknown) => ({ rpc: vi.fn(rpc) }) as unknown as SupabaseClient & {
  rpc: ReturnType<typeof vi.fn>;
};

describe("runPointsEarn", () => {
  it("releases as of the job's clock and reports how many it wrote", async () => {
    const admin = rpcAdmin(async () => ({ data: 4, error: null }));
    const now = new Date("2026-11-20T01:00:00.000Z");
    expect(await runPointsEarn(admin, now)).toEqual({ written: 4 });
    expect(admin.rpc).toHaveBeenCalledWith("release_earned_points", { p_now: "2026-11-20T01:00:00.000Z" });
  });

  it("reports a database error without throwing", async () => {
    const admin = rpcAdmin(async () => ({ data: null, error: { message: "permission denied" } }));
    expect(await runPointsEarn(admin)).toEqual({ error: "Could not release earned points: permission denied" });
  });

  it("reports a thrown error without throwing", async () => {
    const admin = rpcAdmin(async () => {
      throw new Error("fetch failed");
    });
    expect(await runPointsEarn(admin)).toEqual({ error: "Could not release earned points: fetch failed" });
  });
});

describe("runPointsMilestones (slice 09)", () => {
  it("grants as of the job's clock and reports how many bonuses", async () => {
    const admin = rpcAdmin(async () => ({ data: 2, error: null }));
    const now = new Date("2026-11-20T01:00:00.000Z");
    expect(await runPointsMilestones(admin, now)).toEqual({ granted: 2 });
    expect(admin.rpc).toHaveBeenCalledWith("grant_due_milestone_bonuses", { p_now: "2026-11-20T01:00:00.000Z" });
  });

  it("reports an error without throwing", async () => {
    expect(await runPointsMilestones(rpcAdmin(async () => ({ data: null, error: { message: "permission denied" } })))).toEqual({
      error: "Could not grant milestone bonuses: permission denied",
    });
    const throwing = rpcAdmin(async () => {
      throw new Error("fetch failed");
    });
    expect(await runPointsMilestones(throwing)).toEqual({ error: "Could not grant milestone bonuses: fetch failed" });
  });
});

describe("clawbackPointsForRefund", () => {
  it("passes the Order, the refund and its amount in dollars, and reports the points taken", async () => {
    const admin = rpcAdmin(async () => ({ data: 90, error: null }));
    expect(await clawbackPointsForRefund(admin, { orderId: "order-1", refundId: "re_1", amount: 30 })).toEqual({ taken: 90 });
    expect(admin.rpc).toHaveBeenCalledWith("clawback_points_for_refund", {
      p_order_id: "order-1",
      p_refund_id: "re_1",
      p_refund_amount: 30,
    });
  });

  it("reports 0 when nothing applies", async () => {
    const admin = rpcAdmin(async () => ({ data: 0, error: null }));
    expect(await clawbackPointsForRefund(admin, { orderId: "order-1", refundId: "re_1", amount: 30 })).toEqual({ taken: 0 });
  });

  it("refuses a missing refund id or amount without calling the database", async () => {
    const admin = rpcAdmin(async () => ({ data: 0, error: null }));
    expect(await clawbackPointsForRefund(admin, { orderId: "order-1", refundId: " ", amount: 30 })).toHaveProperty("error");
    expect(await clawbackPointsForRefund(admin, { orderId: "order-1", refundId: "re_1", amount: Number.NaN })).toHaveProperty("error");
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("reports a database error or a throw without throwing", async () => {
    const failing = rpcAdmin(async () => ({ data: null, error: { message: "deadlock detected" } }));
    expect(await clawbackPointsForRefund(failing, { orderId: "o", refundId: "re_2", amount: 5 })).toEqual({
      error: "Could not take back points for refund re_2: deadlock detected",
    });
    const throwing = rpcAdmin(async () => {
      throw new Error("fetch failed");
    });
    expect(await clawbackPointsForRefund(throwing, { orderId: "o", refundId: "re_2", amount: 5 })).toEqual({
      error: "Could not take back points for refund re_2: fetch failed",
    });
  });
});
