import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { resetRateLimits } from "@/lib/rate-limit";

/**
 * The Staff order routes (ADR 0048): every one needs `orders`; the create
 * route prices the order again from the database whatever the body says, and
 * writes the Audit Log; the public Pay route takes nothing but the token.
 */

const h = vi.hoisted(() => ({
  denied: null as null | "401" | "403",
  quote: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  open: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async (permission: string) => {
    expect(permission).toBe("orders");
    if (h.denied) return NextResponse.json({ error: "no" }, { status: Number(h.denied) });
    return null;
  },
  getAdminContext: async () => ({ userId: "user-1", email: "staff@mpillow.test", memberId: "m-1" }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/staff-orders/quote", () => ({
  quoteStaffOrder: h.quote,
  quoteView: (q: Record<string, unknown>) => ({ total: q.total }),
}));
vi.mock("@/lib/staff-orders/create", () => ({ createStaffOrder: h.create }));
vi.mock("@/lib/staff-orders/send", () => ({ sendPaymentRequest: h.send }));
vi.mock("@/lib/staff-orders/checkout", () => ({ openStaffOrderCheckout: h.open }));
vi.mock("@/lib/staff-orders/options", () => ({ loadStaffOrderOptions: vi.fn(async () => ({ products: [] })) }));

const create = (await import("@/app/api/staff-orders/route")).POST;
const quote = (await import("@/app/api/staff-orders/quote/route")).POST;
const options = (await import("@/app/api/staff-orders/options/route")).GET;
const send = (await import("@/app/api/staff-orders/[id]/send/route")).POST;
const pay = (await import("@/app/api/pay/[token]/checkout/route")).POST;

const CUSTOMER = "0b0b0b0b-0000-4000-8000-000000000001";
const VARIANT = "0c0c0c0c-0000-4000-8000-000000000001";
const TOKEN = "3f2a3c1e-8a5b-4b8e-9a51-0c7c9d2f1b6a";
const body = {
  customer_id: CUSTOMER,
  goods: [{ variant_id: VARIANT, quantity: 1 }],
  delivery: { kind: "studio", location_id: "studio-1" },
};
const post = (url: string, json?: unknown) =>
  new Request(`https://x.test${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: json === undefined ? undefined : JSON.stringify(json),
  });

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://custom.mpillow.com";
  resetRateLimits();
  h.denied = null;
  vi.clearAllMocks();
  h.quote.mockResolvedValue({
    ok: true,
    quote: { total: 39, customer: { id: CUSTOMER, locale: "en-US" } },
  });
  h.create.mockResolvedValue({
    ok: true,
    orderId: "order-1",
    orderNumber: "MP-20261107-0001",
    token: TOKEN,
    expiresAt: "2026-11-14T04:00:00.000Z",
  });
  h.send.mockResolvedValue({ ok: true, sentTo: "ada@example.com", expiresAt: "2026-11-14T04:00:00.000Z", url: "u" });
});

describe("Staff routes need the orders permission", () => {
  it.each([
    ["create", () => create(post("/api/staff-orders", body))],
    ["quote", () => quote(post("/api/staff-orders/quote", body))],
    ["options", () => options(new Request(`https://x.test/api/staff-orders/options?customer_id=${CUSTOMER}`))],
    ["send", () => send(post("/api/staff-orders/order-1/send"), { params: Promise.resolve({ id: "order-1" }) })],
  ])("%s answers 403 without it, and touches nothing", async (_name, call) => {
    h.denied = "403";
    expect((await call()).status).toBe(403);
    expect(h.quote).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("POST /api/staff-orders", () => {
  it("prices the draft again on the server, never from the body, and emails the link", async () => {
    const res = await create(post("/api/staff-orders", { ...body, total: 0.5, unit_price: 0.01 }));
    expect(res.status).toBe(201);
    const draft = h.quote.mock.calls[0][1];
    expect(draft).not.toHaveProperty("total");
    expect(draft).not.toHaveProperty("send_email");
    expect(h.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ total: 39 }), {
      userId: "user-1",
      email: "staff@mpillow.test",
    });
    expect(h.send).toHaveBeenCalledWith(expect.anything(), "order-1", {
      origin: "https://custom.mpillow.com",
      actorEmail: "staff@mpillow.test",
    });
    expect(await res.json()).toEqual({
      ok: true,
      order: { id: "order-1", order_number: "MP-20261107-0001", total: 39 },
      link: { url: `https://custom.mpillow.com/en-US/pay/${TOKEN}`, expires_at: "2026-11-14T04:00:00.000Z" },
      emailed: { ok: true, sentTo: "ada@example.com" },
    });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order.staff_create", entityType: "order", entityId: "order-1" }),
    );
  });

  it("does not email when Staff untick it, and a failed email never loses the order", async () => {
    const quiet = await create(post("/api/staff-orders", { ...body, send_email: false }));
    expect((await quiet.json()).emailed).toBeNull();
    expect(h.send).not.toHaveBeenCalled();

    h.send.mockResolvedValue({ ok: false, status: 502, error: "The email could not be sent." });
    const failed = await create(post("/api/staff-orders", body));
    expect(failed.status).toBe(201);
    expect((await failed.json()).emailed).toEqual({ ok: false, error: "The email could not be sent." });
  });

  it("passes on a refusal from the quote and writes nothing", async () => {
    h.quote.mockResolvedValue({ ok: false, status: 400, error: "Travel Pouch · One size is out of stock." });
    const res = await create(post("/api/staff-orders", body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Travel Pouch · One size is out of stock." });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("refuses an order with nothing in it before pricing", async () => {
    const res = await create(post("/api/staff-orders", { ...body, goods: [] }));
    expect(res.status).toBe(400);
    expect(h.quote).not.toHaveBeenCalled();
  });
});

describe("POST /api/pay/[token]/checkout", () => {
  const call = (token: string) => pay(post(`/api/pay/${token}/checkout`), { params: Promise.resolve({ token }) });

  it("answers the Checkout URL for a real token", async () => {
    h.open.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    expect(h.open).toHaveBeenCalledWith(expect.anything(), TOKEN, { origin: "https://custom.mpillow.com" });
  });

  it("never looks up something that is not a token", async () => {
    expect((await call("not-a-token")).status).toBe(404);
    expect(h.open).not.toHaveBeenCalled();
  });

  it("passes on why it cannot be paid", async () => {
    h.open.mockResolvedValue({ ok: false, status: 409, error: "This order is already paid.", state: "paid" });
    const res = await call(TOKEN);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This order is already paid.", state: "paid" });
  });

  it("limits how often one token can open Checkout", async () => {
    h.open.mockResolvedValue({ ok: true, url: "u" });
    for (let i = 0; i < 10; i++) expect((await call(TOKEN)).status).toBe(200);
    expect((await call(TOKEN)).status).toBe(429);
  });
});
