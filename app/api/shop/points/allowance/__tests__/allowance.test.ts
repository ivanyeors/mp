import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * The "Use points" preview (PRD-loyalty-points slice 04): whose points comes
 * from the session, never the body, and a guest or partner learns nothing.
 */

const OWNER = "8b1c3f9e-0000-4000-8000-000000000001";
const OTHER = "8b1c3f9e-0000-4000-8000-000000000002";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  session: null as string | null,
  balances: {} as Record<string, number>,
  partners: new Set<string>(),
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => ({
      ...fakeSupabaseAdmin(h.db),
      async rpc(fn: string, args: Record<string, unknown>) {
        h.rpc.push({ fn, args });
        const id = String(args.p_customer_id);
        if (fn === "is_partner_customer") return { data: h.partners.has(id), error: null };
        if (fn === "points_balance") return { data: [{ available: h.balances[id] ?? 0, pending: 0 }], error: null };
        return { data: null, error: { message: fn } };
      },
    }),
  };
});
vi.mock("@/lib/shop/customer-addresses", () => ({ getCurrentCustomerId: vi.fn(async () => h.session) }));

const { POST } = await import("@/app/api/shop/points/allowance/route");

const ask = (body: Record<string, unknown>) =>
  POST(
    new Request("https://x.test/api/shop/points/allowance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  ).then(async (res) => ({ status: res.status, body: await res.json() }));

beforeEach(() => {
  h.session = null;
  h.rpc = [];
  h.partners = new Set();
  h.balances = { [OWNER]: 213, [OTHER]: 9000 };
  h.db = {
    site_settings: [
      { key: "points_enabled", value: "true" },
      { key: "points_min_redeem", value: "50" },
      { key: "points_max_share", value: "0.5" },
    ],
    customers: [
      { id: OWNER, email: "wei.ling@example.com" },
      { id: OTHER, email: "someone@example.com" },
    ],
  };
});

describe("POST /api/shop/points/allowance", () => {
  it("works out the signed-in Customer's allowance: S$1 steps, the balance or half the products", async () => {
    h.session = OWNER;
    expect(await ask({ products_after_coupon: 90, email: "Wei.Ling@example.com" })).toEqual({
      status: 200,
      body: { ok: true, usable: true, available: 213, min: 50, max: 210, email_ok: true },
    });
    expect((await ask({ products_after_coupon: 20 })).body).toMatchObject({ max: 100, email_ok: null });
    expect((await ask({ products_after_coupon: 9 })).body).toMatchObject({ usable: true, max: null });
  });

  it("reads the session, never a Customer named in the body", async () => {
    h.session = OWNER;
    const res = await ask({ products_after_coupon: 90, customer_id: OTHER });
    expect(res.body).toMatchObject({ available: 213 });
    expect(h.rpc.every((c) => c.args.p_customer_id === OWNER)).toBe(true);
  });

  it("says the email is not the account's, so checkout would refuse it", async () => {
    h.session = OWNER;
    expect((await ask({ products_after_coupon: 90, email: "someone@example.com" })).body).toMatchObject({ email_ok: false });
    expect((await ask({ products_after_coupon: 90, email: "new@example.com" })).body).toMatchObject({ email_ok: false });
  });

  it("tells a guest, a partner, a small balance and switched-off points the same nothing", async () => {
    const nothing = { status: 200, body: { ok: true, usable: false } };
    expect(await ask({ products_after_coupon: 90 })).toEqual(nothing);
    expect(h.rpc).toEqual([]);

    h.session = OTHER;
    h.partners.add(OTHER);
    expect(await ask({ products_after_coupon: 90 })).toEqual(nothing);

    h.session = OWNER;
    h.balances[OWNER] = 49;
    expect(await ask({ products_after_coupon: 90 })).toEqual(nothing);

    h.balances[OWNER] = 500;
    h.db.site_settings[0].value = "false";
    expect(await ask({ products_after_coupon: 90 })).toEqual(nothing);
  });
});
