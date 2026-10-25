import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { loadSelfPurchaseAllowance } = await import("@/lib/partner-self-purchase/allowance");

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const order = (id: string, extra: Record<string, unknown>) => ({
  id,
  self_purchase_partner_id: "p1",
  self_purchase_units: 1,
  status: "pending",
  paid_at: null,
  created_at: hoursAgo(1),
  ...extra,
});

beforeEach(() => {
  h.db = {
    partners: [{ id: "p1", self_purchase_kind: "percent", self_purchase_amount: 20, self_purchase_unit_cap: 3 }],
    orders: [],
  };
});

describe("loadSelfPurchaseAllowance", () => {
  it("counts an open checkout, so several opened before paying cannot each take the full cap", async () => {
    h.db.orders.push(order("o-paid", { status: "confirmed", paid_at: hoursAgo(30), created_at: hoursAgo(30) }));
    h.db.orders.push(order("o-open", {}));
    expect((await loadSelfPurchaseAllowance("p1")).remaining).toBe(1);
  });

  it("stops counting an abandoned checkout once it can no longer be paid, and never a cancelled one", async () => {
    h.db.orders.push(order("o-stale", { created_at: hoursAgo(30) }));
    h.db.orders.push(order("o-cancelled", { status: "cancelled" }));
    expect((await loadSelfPurchaseAllowance("p1")).remaining).toBe(3);
  });
});
