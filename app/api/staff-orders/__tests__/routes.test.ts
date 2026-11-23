import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { resetRateLimits } from "@/lib/rate-limit";

const h = vi.hoisted(() => ({
  denied: null as null | "401" | "403",
  quote: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  open: vi.fn(),
  audit: vi.fn(),
  markPaid: vi.fn(),
  listPayments: vi.fn(),
  stripeDown: false,
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
vi.mock("@/lib/staff-orders/mark-paid", () => ({ markStaffOrderPaid: h.markPaid }));
vi.mock("@/lib/staff-orders/stripe-payments", () => ({ listMatchingStripePayments: h.listPayments }));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => {
    if (h.stripeDown) throw new Error("STRIPE_SECRET_KEY is not set");
    return {};
  },
}));
vi.mock("@/lib/staff-orders/options", () => ({ loadStaffOrderOptions: vi.fn(async () => ({ products: [] })) }));

const create = (await import("@/app/api/staff-orders/route")).POST;
const quote = (await import("@/app/api/staff-orders/quote/route")).POST;
const options = (await import("@/app/api/staff-orders/options/route")).GET;
const send = (await import("@/app/api/staff-orders/[id]/send/route")).POST;
const pay = (await import("@/app/api/pay/[token]/checkout/route")).POST;
const markPaid = (await import("@/app/api/staff-orders/[id]/mark-paid/route")).POST;
const stripePayments = (await import("@/app/api/staff-orders/stripe-payments/route")).GET;

const CUSTOMER = "0b0b0b0b-0000-4000-8000-000000000001";
const VARIANT = "0c0c0c0c-0000-4000-8000-000000000001";
const TOKEN = "5a1e5a1e-0000-4000-8000-0000000f0009";
const body = {
  customer_id: CUSTOMER,
  goods: [{ variant_id: VARIANT, quantity: 1 }],
  delivery: { kind: "studio", location_id: "studio-1" },
};
const CASH = { kind: "outside", method: "cash" };
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
  h.markPaid.mockResolvedValue({ ok: true, paidAt: "2026-11-07T04:00:00.000Z", method: "cash", warnings: [] });
  h.listPayments.mockResolvedValue([]);
  h.stripeDown = false;
});

describe("Staff routes need the orders permission", () => {
  it.each([
    ["create", () => create(post("/api/staff-orders", body))],
    ["quote", () => quote(post("/api/staff-orders/quote", body))],
    ["options", () => options(new Request(`https://x.test/api/staff-orders/options?customer_id=${CUSTOMER}`))],
    ["send", () => send(post("/api/staff-orders/order-1/send"), { params: Promise.resolve({ id: "order-1" }) })],
    ["mark paid", () => markPaid(post("/api/staff-orders/order-1/mark-paid", CASH), { params: Promise.resolve({ id: "order-1" }) })],
    ["Stripe payments", () => stripePayments(new Request("https://x.test/api/staff-orders/stripe-payments?amount=39"))],
  ])("%s answers 403 without it, and touches nothing", async (_name, call) => {
    h.denied = "403";
    expect((await call()).status).toBe(403);
    expect(h.quote).not.toHaveBeenCalled();
    expect(h.create).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
    expect(h.markPaid).not.toHaveBeenCalled();
    expect(h.listPayments).not.toHaveBeenCalled();
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
      paid: null,
    });
    expect(h.markPaid).not.toHaveBeenCalled();
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

  it("marks an order paid when Staff say it is, and sends no payment link email", async () => {
    const res = await create(post("/api/staff-orders", { ...body, paid: CASH }));
    expect(res.status).toBe(201);
    expect(h.markPaid).toHaveBeenCalledWith(expect.anything(), "order-1", CASH, { userId: "user-1", email: "staff@mpillow.test" });
    expect(h.send).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({ emailed: null, paid: { ok: true, method: "cash", warnings: [] } });
    expect(h.audit.mock.calls.map((c) => c[0].action)).toEqual(["order.staff_create", "order.mark_paid"]);
  });

  it("keeps the order, unpaid with its link, when marking it paid is refused", async () => {
    h.markPaid.mockResolvedValue({ ok: false, status: 409, error: "That Stripe payment has been refunded." });
    const res = await create(post("/api/staff-orders", { ...body, paid: { kind: "stripe", payment_intent_id: "pi_1" } }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.paid).toEqual({ ok: false, error: "That Stripe payment has been refunded." });
    expect(json.link.url).toContain(TOKEN);
    expect(h.audit.mock.calls.map((c) => c[0].action)).toEqual(["order.staff_create"]);
  });

  it("refuses a way of paying it does not know before making anything", async () => {
    const res = await create(post("/api/staff-orders", { ...body, paid: { kind: "outside", method: "iou" } }));
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
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

describe("POST /api/staff-orders/[id]/mark-paid", () => {
  const call = (json: unknown) =>
    markPaid(post("/api/staff-orders/order-1/mark-paid", json), { params: Promise.resolve({ id: "order-1" }) });

  it("marks the order paid and writes who did it to the Audit Log", async () => {
    const res = await call({ ...CASH, total: 1, paid_at: "2020-01-01" });
    expect(res.status).toBe(200);
    expect(h.markPaid).toHaveBeenCalledWith(expect.anything(), "order-1", CASH, { userId: "user-1", email: "staff@mpillow.test" });
    expect(await res.json()).toEqual({ ok: true, paid_at: "2026-11-07T04:00:00.000Z", method: "cash", warnings: [] });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "order.mark_paid", entityId: "order-1", after: expect.objectContaining({ paid: CASH }) }),
    );
  });

  it.each([
    ["nothing", undefined],
    ["a Stripe payment with no id", { kind: "stripe" }],
    ["something that is not a Stripe payment id", { kind: "stripe", payment_intent_id: "ch_123" }],
    ["another way with no note", { kind: "outside", method: "other" }],
  ])("refuses %s without touching the order", async (_name, json) => {
    expect((await call(json)).status).toBe(400);
    expect(h.markPaid).not.toHaveBeenCalled();
  });

  it("passes on why it cannot be marked paid, and audits nothing", async () => {
    h.markPaid.mockResolvedValue({ ok: false, status: 409, error: "This order is already paid." });
    const res = await call(CASH);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "This order is already paid." });
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("GET /api/staff-orders/stripe-payments", () => {
  const call = (query: string) => stripePayments(new Request(`https://x.test/api/staff-orders/stripe-payments${query}`));

  it("lists the payments of that amount", async () => {
    h.listPayments.mockResolvedValue([{ id: "pi_1", amount: 39 }]);
    const res = await call("?amount=39.00");
    expect(await res.json()).toEqual({ ok: true, payments: [{ id: "pi_1", amount: 39 }] });
    expect(h.listPayments).toHaveBeenCalledWith(expect.anything(), expect.anything(), { amount: 39, currency: "SGD" });
  });

  it("asks for the order's own payments too when it is named", async () => {
    await call(`?amount=39&order_id=${CUSTOMER}`);
    expect(h.listPayments).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      amount: 39,
      currency: "SGD",
      orderId: CUSTOMER,
    });
    expect((await call("?amount=39&order_id=not-an-order")).status).toBe(400);
  });

  it.each(["", "?amount=abc", "?amount=0", "?amount=-5"])("refuses %j", async (query) => {
    expect((await call(query)).status).toBe(400);
    expect(h.listPayments).not.toHaveBeenCalled();
  });

  it("says so when Stripe is not connected", async () => {
    h.stripeDown = true;
    expect((await call("?amount=39")).status).toBe(503);
  });
});
