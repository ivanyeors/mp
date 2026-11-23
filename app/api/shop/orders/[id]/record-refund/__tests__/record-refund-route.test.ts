import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({ denied: false, record: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async (permission: string) => {
    expect(permission).toBe("orders");
    return h.denied ? NextResponse.json({ error: "no" }, { status: 403 }) : null;
  },
  getAdminContext: async () => ({ userId: "staff-1", email: "staff@example.com", memberId: "m-1" }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/ecommerce/outside-refund", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/outside-refund")>()),
  recordOutsideRefund: h.record,
}));

const { POST } = await import("@/app/api/shop/orders/[id]/record-refund/route");

const call = (body: unknown) =>
  POST(new Request("https://x.test/api/shop/orders/o1/record-refund", { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "o1" }),
  });
const GOOD = { amount: 30, note: "Cash handed back" };

beforeEach(() => {
  vi.clearAllMocks();
  h.denied = false;
  h.record.mockResolvedValue({ ok: true, amount: 30, fullyRefunded: false });
});

describe("POST /api/shop/orders/[id]/record-refund", () => {
  it("needs the orders permission and records nothing without it", async () => {
    h.denied = true;
    expect((await call(GOOD)).status).toBe(403);
    expect(h.record).not.toHaveBeenCalled();
  });

  it.each([
    ["no amount", { note: "cash" }],
    ["a negative amount", { amount: -5, note: "cash" }],
    ["an amount typed as text", { amount: "30", note: "cash" }],
    ["no note", { amount: 30 }],
  ])("refuses %s", async (_name, body) => {
    expect((await call(body)).status).toBe(400);
    expect(h.record).not.toHaveBeenCalled();
  });

  it("records it, and the Audit Log says who, how much and that no money moved through Stripe", async () => {
    const res = await call({ ...GOOD, order_id: "someone-else", status: "refunded" });
    expect(await res.json()).toEqual({ ok: true, amount: 30, fully_refunded: false });
    expect(h.record).toHaveBeenCalledWith(expect.anything(), "o1", GOOD, { email: "staff@example.com" });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "order.refund_recorded",
        entityId: "o1",
        after: expect.objectContaining({ amount: 30, note: "Cash handed back", outside_stripe: true }),
      }),
    );
  });

  it("passes on a refusal and audits nothing", async () => {
    h.record.mockResolvedValue({ ok: false, status: 400, error: "Record between 0.01 and 10.00 SGD." });
    const res = await call(GOOD);
    expect(res.status).toBe(400);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
