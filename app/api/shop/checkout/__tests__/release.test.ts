import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Going back from the on-page payment step (ADR 0052) closes that Order's
 * Checkout and gives back its points at once, so a resubmit can spend them.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  sessionStatus: "open" as string,
  retrieve: vi.fn(),
  expire: vi.fn(),
  rpc: [] as string[],
  timeline: [] as string[],
}));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const base = fakeSupabaseAdmin(h.db);
      return {
        from: (table: string) => base.from(table),
        async rpc(fn: string) {
          if (fn === "rate_limit_hit") return { data: false, error: null };
          h.rpc.push(fn);
          if (fn === "release_points") return { data: true, error: null };
          return { data: null, error: { message: `unexpected rpc ${fn}` } };
        },
      };
    },
  };
});
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: h.retrieve, expire: h.expire } } }),
}));
vi.mock("@/lib/ecommerce/orders", () => ({
  addOrderTimelineEvent: vi.fn(async (_id: string, type: string) => {
    h.timeline.push(type);
  }),
}));

const { POST: release } = await import("@/app/api/shop/checkout/release/route");

beforeEach(() => {
  vi.clearAllMocks();
  h.rpc = [];
  h.timeline = [];
  h.sessionStatus = "open";
  h.retrieve.mockImplementation(async (id: string) => ({ id, status: h.sessionStatus }));
  h.expire.mockImplementation(async (id: string) => ({ id, status: "expired" }));
  h.db = {
    orders: [{ id: "order-1", status: "pending", paid_at: null, stripe_session_id: "cs_test_1" }],
  };
});

function post(body: unknown) {
  return release(
    new Request("https://x.test/api/shop/checkout/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  ).then(async (res) => ({ status: res.status, body: (await res.json()) as Record<string, unknown> }));
}

const order = () => h.db.orders[0] as Record<string, unknown>;

describe("POST /api/shop/checkout/release", () => {
  it("expires the open Session, cancels the pending Order and gives back its points", async () => {
    const res = await post({ session_id: "cs_test_1" });
    expect(res).toEqual({ status: 200, body: { ok: true, released: true } });
    expect(h.expire).toHaveBeenCalledWith("cs_test_1");
    expect(order()).toMatchObject({ status: "cancelled", cancelled_at: expect.any(String) });
    expect(h.rpc).toEqual(["release_points"]);
    expect(h.timeline).toEqual(["checkout_released", "points_released"]);
  });

  it("leaves a Session Stripe already completed to the webhook", async () => {
    h.sessionStatus = "complete";
    const res = await post({ session_id: "cs_test_1" });
    expect(res.body).toEqual({ ok: true, released: false });
    expect(h.expire).not.toHaveBeenCalled();
    expect(order().status).toBe("pending");
    expect(h.rpc).toEqual([]);
  });

  it("changes nothing for a paid Order", async () => {
    h.db.orders = [{ id: "order-1", status: "confirmed", paid_at: "2026-11-16T00:00:00Z", stripe_session_id: "cs_test_1" }];
    const res = await post({ session_id: "cs_test_1" });
    expect(res.body).toEqual({ ok: true, released: false });
    expect(h.retrieve).not.toHaveBeenCalled();
    expect(order().status).toBe("confirmed");
  });

  it("answers an unknown Session the same way, without touching Stripe", async () => {
    const res = await post({ session_id: "cs_test_unknown" });
    expect(res.body).toEqual({ ok: true, released: false });
    expect(h.retrieve).not.toHaveBeenCalled();
  });

  it("keeps the Order when Stripe will not close its Session", async () => {
    h.expire.mockRejectedValue(new Error("stripe down"));
    const res = await post({ session_id: "cs_test_1" });
    expect(res.status).toBe(502);
    expect(order().status).toBe("pending");
    expect(h.rpc).toEqual([]);
  });

  it("refuses anything that is not a Checkout Session id", async () => {
    expect((await post({ session_id: "pi_123" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
  });
});
