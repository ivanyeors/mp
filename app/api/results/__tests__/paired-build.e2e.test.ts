import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * Paired build end to end (ADR 0026), adversarially.
 *
 * The REAL route handlers — hold, Stripe webhook, status GET, assign, accept,
 * decline, cancel, Result delete and the SLA cron — run in sequence against ONE
 * shared in-memory Supabase (./paired-build.fakes.ts) and a faithful Stripe fake.
 * Only true I/O is replaced: Stripe, email transport, Telegram, the Composed
 * sellable loader and service-fee price table, the tax-rule table, and the
 * auth/session lookups. Pricing, lifecycle, capture plan, settlement, attach,
 * pair rules, the money ledger and every route's own logic are the real modules.
 *
 * Prices (SGD, GST 9% exclusive on goods, shipping 10 flat):
 *   Mpillow M premium  goods 300 + ship 10 + tax 27.00 = 337.00
 *   Mbolster medium    goods 150 + ship  0 + tax 13.50 = 163.50
 *   pair hold                                           = 500.50
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  staff: null as null | Record<string, unknown>,
  emails: [] as Array<{ to: string; subject: string; text: string; html?: string }>,
  telegrams: [] as string[],
  pillowBase: 300,
  bolsterBase: 150,
  commissions: [] as unknown[],
}));

vi.mock("@/lib/supabase/server", async () => {
  const f = await import("./paired-build.fakes");
  return { supabaseAdmin: () => f.fakeAdmin };
});
vi.mock("@/lib/stripe/client", async () => {
  const f = await import("./paired-build.fakes");
  return { getStripe: () => f.fakeStripeClient };
});
vi.mock("@/lib/auth/user", () => ({ getAuthUser: async () => null }));
vi.mock("@/lib/auth/admin", () => {
  const denied = () => NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return {
    getAdminContext: async () => h.staff,
    requireAdmin: async () => (h.staff ? null : denied()),
    requireAnyAdmin: async () => (h.staff ? null : denied()),
  };
});
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: async () => {} }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: async () => null, actingProfile: async () => null }));
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  getEmailTransport: () => ({
    send: async (m: { to: string; subject: string; text: string; html?: string }) => {
      h.emails.push(m);
    },
  }),
  sendOrderConfirmedEmails: vi.fn(),
  sendRefundEmail: vi.fn(),
}));
vi.mock("@/lib/email/transport", () => ({ getDefaultFromAddress: () => "shop@x.test" }));
vi.mock("@/lib/telegram/notify", () => ({
  sendTelegram: async (text: string) => {
    h.telegrams.push(text);
    return "sent";
  },
}));
vi.mock("@/lib/discovery-source", () => ({
  getDiscoverySourceCatalog: async () => [],
  validateDiscoverySource: () => null,
  normalizeDiscoverySourceOther: () => null,
}));
vi.mock("@/lib/referrals", () => ({ getPartnerByReferralCode: async () => null, isSelfReferral: async () => false }));
vi.mock("@/lib/configurator/pre-order-persist", async (orig) => ({
  ...(await orig<typeof import("@/lib/configurator/pre-order-persist")>()),
  loadPreOrderTriggerAtHold: async () => ({ preferenceStocks: [100], composedBuildable: 100 }),
}));
vi.mock("@/lib/config-upload", () => ({ listConfigUploads: async () => [] }));
vi.mock("@/lib/results/composed-sellable", async (orig) => ({
  ...(await orig<typeof import("@/lib/results/composed-sellable")>()),
  loadComposedSellable: async (_admin: unknown, key: { productType: string }) =>
    key.productType === "pillow"
      ? {
          ok: true,
          sellable: {
            bomLines: [
              { item_id: 50, quantity: 1, category: "packaging" },
              { item_id: 1, quantity: 1, category: "cover" },
              { item_id: 2, quantity: 1, category: "pillow_case" },
            ],
            msrp: h.pillowBase,
            priceFault: null,
            msrpByFamily: { linen: h.pillowBase },
            defaultCover: { item_id: 1, msrp: 20 },
            defaultCase: { item_id: 2, msrp: 30, family: "linen" },
            caseOptions: [{ item_id: 2, msrp: 30, family: "linen" }],
            coverOptions: [{ item_id: 1, msrp: 20 }],
            currency: "SGD",
          },
        }
      : {
          ok: true,
          sellable: {
            bomLines: [
              { item_id: 51, quantity: 1, category: "packaging" },
              { item_id: 3, quantity: 1, category: "bolster_case" },
            ],
            msrp: h.bolsterBase,
            priceFault: null,
            msrpByFamily: { "": h.bolsterBase },
            defaultCover: null,
            defaultCase: { item_id: 3, msrp: 25 },
            caseOptions: [{ item_id: 3, msrp: 25 }],
            coverOptions: [],
            currency: "SGD",
          },
        },
}));
vi.mock("@/lib/pricing/service-prices", async (orig) => ({
  ...(await orig<typeof import("@/lib/pricing/service-prices")>()),
  loadServicePrices: async () => ({
    measurement_basic: { msrp: 20, costPrice: 5 },
    measurement_premium: { msrp: 40, costPrice: 10 },
  }),
}));
vi.mock("@/lib/ecommerce/tax", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/tax")>()),
  resolveTaxRuleForRegion: async () => ({
    region: "SG",
    name: "GST",
    rate: 0.09,
    mode: "exclusive",
    appliesToShipping: false,
  }),
}));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: async (_a: unknown, x: unknown) => {
    h.commissions.push(x);
  },
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));
// The cron chains unrelated jobs after the SLA work; none of them touch Results.
vi.mock("@/lib/shopify/order-mirror-catchup", () => ({ runShopifyOrderMirrorCatchup: async () => ({ ok: true }) }));
vi.mock("@/lib/analytics/journey/ga-sync", () => ({ runGaSync: async () => ({ ok: true }) }));
vi.mock("@/lib/seo-metrics/ingest-gsc", () => ({ runGscIngestFromEnv: async () => ({ ok: true }) }));
vi.mock("@/lib/configurator/pre-order-restock", () => ({ runPreOrderRestockNotices: async () => ({ ok: true }) }));
vi.mock("@/lib/reviews/google-sync", () => ({ syncGoogleReviews: async () => ({ ok: true }) }));

const f = await import("./paired-build.fakes");
const { pairedHoldBody } = await import("@/lib/configurator/paired-mbolster");
const holdRoute = await import("@/app/api/results/hold/route");
const webhookRoute = await import("@/app/api/stripe/webhook/route");
const statusRoute = await import("@/app/api/results/[id]/route");
const assignRoute = await import("@/app/api/results/[id]/assign/route");
const acceptRoute = await import("@/app/api/results/[id]/accept/route");
const declineRoute = await import("@/app/api/results/[id]/decline/route");
const cancelRoute = await import("@/app/api/results/[id]/cancel/route");
const responsesRoute = await import("@/app/api/mp-config/responses/[id]/route");
const cronRoute = await import("@/app/api/cron/results-sla/route");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ANCHOR = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const COMP = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const COMP2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STRANGER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BOLSTER_ALONE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TOKEN = "11111111-1111-4111-8111-111111111111";
const SHIP = "5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a";

const PILLOW_QUOTE = 337;
const BOLSTER_QUOTE = 163.5;
const PAIR_QUOTE = 500.5;

const STAFF = {
  memberId: "member-1",
  userId: "user-1",
  email: "staff@x.test",
  roleId: "r",
  roleKey: "admin",
  roleName: "Admin",
  isOwner: false,
  grantsAll: true,
  permissions: new Set(["results", "orders"]),
  isBootstrap: false,
};

const T0 = new Date("2026-10-05T02:00:00.000Z"); // a Monday

function seed(extra: Record<string, Row[]> = {}) {
  f.resetDb({
    items: [
      { id: 1, name: "Tencel cover", subtype: null, category: "cover", price_family: null },
      { id: 2, name: "Linen case", subtype: null, category: "pillow_case", price_family: "linen" },
      { id: 3, name: "Bolster case", subtype: null, category: "bolster_case", price_family: null, size: "M" },
      { id: 10, name: "Latex chips", subtype: null, category: "filling", price_family: null },
      { id: 11, name: "Fibre", subtype: null, category: "filling", price_family: null },
      { id: 50, name: "Pillow box", subtype: null, category: "packaging", price_family: null },
      { id: 51, name: "Bolster bag", subtype: null, category: "packaging", price_family: null },
      { id: 60, name: "Eye mask", subtype: null, category: "accessory", price_family: null },
    ],
    item_prices: [
      { item_id: 1, msrp: 20, cost_price: 4 },
      { item_id: 2, msrp: 30, cost_price: 6 },
      { item_id: 3, msrp: 25, cost_price: 5 },
      { item_id: 10, msrp: null, cost_price: 1 },
      { item_id: 11, msrp: null, cost_price: 1 },
      { item_id: 50, msrp: null, cost_price: 2 },
      { item_id: 51, msrp: null, cost_price: 2 },
      { item_id: 60, msrp: 15, cost_price: 3 },
    ],
    inventory_balances: [1, 2, 3, 10, 11, 50, 51, 60].map((item_id) => ({ item_id, on_hand: 100 })),
    bom_templates: [
      { id: 7, kind: "pillow", key: "M", role: "filling", is_active: true, name: "Soft M" },
      { id: 8, kind: "bolster", key: "medium", role: "filling", is_active: true, name: "Bolster medium" },
    ],
    bom_template_keys: [
      { template_id: 7, key: "M" },
      { template_id: 8, key: "medium" },
    ],
    bom_template_lines: [
      { template_id: 7, item_id: 10, quantity: 3 },
      { template_id: 8, item_id: 11, quantity: 2 },
    ],
    shipping_methods: [
      { id: SHIP, slug: "standard", is_active: true, base_rate: 10, free_above: null, content: {} },
    ],
    // The Mpillow configurator's Draft, as /api/mp-config/responses wrote it.
    mp_config_responses: [
      {
        id: ANCHOR,
        data: { name: "Ada" },
        is_final: false,
        status: null,
        source: "online_purchase",
        product_type: "pillow",
        access_token: TOKEN,
        customer_id: null,
        customer_email: null,
        measured_by_type: "by_user",
        measured_by_staff_id: null,
        payment_intent_id: null,
        paired_build_id: null,
        order_id: null,
        created_at: T0.toISOString(),
        payment_reminder_count: 0,
      },
    ],
    ...extra,
  });
}

const pendingRecord = {
  flow: "premium-mpillow",
  entryFlow: "premium-mpillow",
  finalFlow: "premium-mpillow",
  size: "M",
  flowRoute: { targetFlow: "mbolster", reason: "You already sleep with a bolster.", nodeId: "route-mbolster" },
  flowRouteDecision: "pending",
};

/** The Mpillow's finished hold body, exactly as mp-config hands it over. */
const pillowHold = (extra: Row = {}): Row => ({
  responseId: ANCHOR,
  token: TOKEN,
  email: "ada@x.test",
  phone: "91234567",
  discoverySource: "instagram",
  measurements: { name: "Ada", sleepPositionType: ["side"] },
  suggestedSize: "M",
  suggestedTier: "premium",
  preferenceLines: [
    { item_id: 1, quantity: 1, category: "cover" },
    { item_id: 2, quantity: 1, category: "case" },
  ],
  addonLines: [],
  shippingMethodId: SHIP,
  shippingAddress: { recipient: "Ada", line1: "1 Road", city: "Singapore", postal_code: "123456", country: "SG" },
  cancelPath: "/mp-config",
  recommendationRecord: pendingRecord,
  ...extra,
});

const bolster = (extra: Row = {}) => ({
  responseId: COMP,
  suggestedLength: "medium",
  measurements: { height_cm: 170, sleep_position: "side" as const },
  preferenceLines: [{ item_id: 3, quantity: 1, category: "case" as const }],
  addonLines: [] as Array<{ item_id: number; quantity: number }>,
  recommendationRecord: { flow: "mbolster", size: "medium" },
  ...extra,
});

// ---------------------------------------------------------------------------
// Route drivers
// ---------------------------------------------------------------------------

const BASE = "http://localhost:3000";
const json = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** A JSON response body, walkable to any depth without a cast at each step. */
type Body = { [key: string]: Body };

async function call(res: Promise<Response> | Response) {
  const r = await res;
  const body = await r.json().catch(() => null);
  return { status: r.status, body } as { status: number; body: Body };
}

async function asStaff<T>(fn: () => Promise<T>): Promise<T> {
  h.staff = STAFF;
  try {
    return await fn();
  } finally {
    h.staff = null;
  }
}

const hold = (body: Row) => call(holdRoute.POST(new Request(`${BASE}/api/results/hold`, json(body))));
const holdPair = (pillowExtra: Row = {}, bolsterExtra: Row = {}) =>
  hold(pairedHoldBody(pillowHold(pillowExtra), bolster(bolsterExtra) as never));
const holdSkip = (pillowExtra: Row = {}) => hold(pairedHoldBody(pillowHold(pillowExtra), null));

const webhook = (event: unknown) =>
  call(
    webhookRoute.POST(
      new Request(`${BASE}/api/stripe/webhook`, {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=fake" },
        body: JSON.stringify(event),
      }),
    ),
  );

const status = (id: string, extra = "") =>
  call(statusRoute.GET(new Request(`${BASE}/api/results/${id}?token=${TOKEN}${extra}`), params(id)));

const assign = (id: string, body: Row) =>
  asStaff(() => call(assignRoute.POST(new Request(`${BASE}/api/results/${id}/assign`, json(body)), params(id))));
const assignPillow = (extra: Row = {}) =>
  assign(ANCHOR, { assignedSize: "M", assignedTier: "premium", fillingTemplateId: 7, ...extra });
const assignBolster = (id = COMP, extra: Row = {}) =>
  assign(id, { assignedLength: "medium", fillingTemplateId: 8, ...extra });

const accept = (id = ANCHOR, extra: Row = {}) =>
  call(acceptRoute.POST(new Request(`${BASE}/api/results/${id}/accept`, json({ token: TOKEN, ...extra })), params(id)));
const decline = (id: string) =>
  call(declineRoute.POST(new Request(`${BASE}/api/results/${id}/decline`, json({ token: TOKEN })), params(id)));
const cancel = (id: string, body: Row = {}) =>
  asStaff(() => call(cancelRoute.POST(new Request(`${BASE}/api/results/${id}/cancel`, json(body)), params(id))));
const deleteResult = (id: string) =>
  asStaff(() =>
    call(
      responsesRoute.DELETE(
        new Request(`${BASE}/api/mp-config/responses/${id}`, { method: "DELETE" }) as never,
        params(id),
      ),
    ),
  );
const cron = () => call(cronRoute.GET(new Request(`${BASE}/api/cron/results-sla`)));

/** Email money uses non-breaking spaces; compare on plain spaces. */
const plain = (s: string) => s.replace(/\s+/g, " ");
const R = (id: string) => f.row("mp_config_responses", id) as Row;
const sessionsCreated = () => f.stripe.calls.sessionsCreate;
const lastSessionId = () => [...f.stripe.sessions.keys()].at(-1)!;
const intentOf = (id: string) => f.stripe.intents.get(String(R(id).payment_intent_id))!;
const orders = () => f.rows("orders");
const goodsLines = (orderId: unknown) =>
  f.rows("order_items").filter((i) => i.order_id === orderId && i.kind !== "service");

/** hold → Stripe Checkout completed → webhook attaches the intent. */
async function heldAndPaid(opts: { skip?: boolean } = {}) {
  const res = opts.skip ? await holdSkip() : await holdPair();
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const session = f.completeCheckout(lastSessionId());
  const wh = await webhook(f.sessionEvent(session));
  expect(wh.status).toBe(200);
  return { res, session };
}

/** A completed, immediate-capture Balance payment session minted for some Result. */
async function fakeTopupFor(resultId: string, amount: number) {
  const s = await f.fakeStripeClient.checkout.sessions.create({
    mode: "payment",
    line_items: [{ quantity: 1, price_data: { currency: "sgd", unit_amount: Math.round(amount * 100), product_data: { name: "top-up" } } }],
    metadata: { result_id: resultId, purpose: "result_topup" },
    success_url: "x",
    cancel_url: "y",
  });
  return f.completeCheckout(s.id).id;
}

async function pairAssigned() {
  await heldAndPaid();
  const a = await assignPillow();
  expect(a.status, JSON.stringify(a.body)).toBe(200);
  const b = await assignBolster();
  expect(b.status, JSON.stringify(b.body)).toBe(200);
}

const errorSpy = vi.spyOn(console, "error");

beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  seed();
  f.resetStripe();
  h.staff = null;
  h.emails = [];
  h.telegrams = [];
  h.commissions = [];
  h.pillowBase = 300;
  h.bolsterBase = 150;
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_fake";
  delete process.env.CRON_SECRET;
  errorSpy.mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  errorSpy.mockReset();
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("Paired build — happy path, end to end", () => {
  it("hold → webhook → assign both → status shows partner → accept: one capture, one Order, two goods lines", async () => {
    const res = await holdPair();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ resultId: ANCHOR, pairedResultId: COMP, authorizedAmount: PAIR_QUOTE });

    // One Checkout, a line per product, the pair's sum, manual capture.
    expect(sessionsCreated()).toHaveLength(1);
    const s = f.stripe.sessions.get(lastSessionId())!;
    expect(s.amount_total).toBe(50050);
    expect(s.capture_method).toBe("manual");
    expect(s.line_items).toEqual([
      { name: "Mpillow M premium hold", amount: 33700 },
      { name: "Mbolster medium hold", amount: 16350 },
    ]);
    expect(s.metadata).toMatchObject({ result_id: ANCHOR, paired_result_id: COMP });

    // Two Results: each quotes its own build; the companion charges no shipping.
    expect(R(ANCHOR)).toMatchObject({
      status: "held",
      paired_build_id: ANCHOR,
      authorized_amount: PILLOW_QUOTE,
      product_type: "pillow",
      is_final: true,
    });
    expect(R(COMP)).toMatchObject({
      status: "held",
      paired_build_id: ANCHOR,
      authorized_amount: BOLSTER_QUOTE,
      product_type: "bolster",
      suggested_length: "medium",
      access_token: TOKEN,
      customer_email: "ada@x.test",
      shipping_method: "standard",
      payment_intent_id: null,
    });
    // The anchor's route was answered "accepted" by Add, so the hold gate passed.
    expect((R(ANCHOR).recommendation_record as Row).flowRouteDecision).toBe("accepted");

    // The webhook attaches ONE intent to BOTH rows.
    const session = f.completeCheckout(lastSessionId());
    const wh = await webhook(f.sessionEvent(session));
    expect(wh.status).toBe(200);
    expect(R(ANCHOR).payment_intent_id).toBe(session.payment_intent);
    expect(R(COMP).payment_intent_id).toBe(session.payment_intent);

    // Assign the pillow: the assigned email waits for the bolster.
    const a = await assignPillow();
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(R(ANCHOR)).toMatchObject({ status: "assigned", final_amount: PILLOW_QUOTE });
    expect(h.emails.filter((e) => /ready/i.test(e.subject))).toHaveLength(0);

    // Assign the bolster: shipping 0 on the companion, and now one email for both.
    const b = await assignBolster();
    expect(b.status, JSON.stringify(b.body)).toBe(200);
    expect(R(COMP)).toMatchObject({ status: "assigned", final_amount: BOLSTER_QUOTE });
    const ready = h.emails.filter((e) => /ready/i.test(e.subject));
    expect(ready).toHaveLength(1);
    expect(plain(ready[0].text)).toContain(`/results/${ANCHOR}?token=${TOKEN}`);
    expect(plain(ready[0].text)).toContain("Total for both: SGD 500.50");
    expect(plain(ready[0].text)).toContain("Authorized hold: SGD 500.50");

    // Status page on the anchor shows its Mbolster; on the companion, points back.
    const st = await status(ANCHOR);
    expect(st.status).toBe(200);
    expect(st.body.result.paired).toMatchObject({ role: "anchor", partner: { id: COMP, status: "assigned" } });
    expect(st.body.result.paired.partner.build.pricing).toMatchObject({ shipping: 0, total: BOLSTER_QUOTE });
    expect(st.body.result.build.pricing).toMatchObject({ shipping: 10, total: PILLOW_QUOTE });
    expect(st.body.result.paired.partner.shipping_address).toBeUndefined();
    const stc = await status(COMP);
    expect(stc.body.result.paired).toMatchObject({ role: "companion", partner: { id: ANCHOR } });

    // Accept on the anchor.
    const pi = String(R(ANCHOR).payment_intent_id);
    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(acc.body).toMatchObject({ ok: true, status: "captured", finalAmount: PAIR_QUOTE, capturedHold: PAIR_QUOTE });

    // Exactly one capture, for the sum, on the one intent.
    expect(f.stripe.calls.capture).toEqual([{ id: pi, amount: 50050 }]);
    expect(f.stripe.intents.get(pi)).toMatchObject({ status: "succeeded", amount_received: 50050, released: 0 });
    expect(f.stripe.calls.cancel).toEqual([]);

    // One Order, two goods lines, shipping only on the pillow.
    expect(orders()).toHaveLength(1);
    const order = orders()[0];
    expect(order).toMatchObject({
      total: PAIR_QUOTE,
      shipping_amount: 10,
      tax_amount: 40.5,
      subtotal: 450,
      payment_reference: pi,
      amount_captured: PAIR_QUOTE,
      status: "confirmed",
    });
    const lines = goodsLines(order.id);
    expect(lines.map((l) => l.sku).sort()).toEqual(["RESULT-BOLSTER-medium", "RESULT-M-premium"]);
    expect(lines.reduce((t, l) => t + Number(l.total_price), 0)).toBe(450);

    // Both Results captured on the same Order, each keeping its own final.
    expect(R(ANCHOR)).toMatchObject({ status: "captured", order_id: order.id, final_amount: PILLOW_QUOTE });
    expect(R(COMP)).toMatchObject({ status: "captured", order_id: order.id, final_amount: BOLSTER_QUOTE });

    // One ledger charge row for the one intent; stock deducted for both builds.
    expect(f.rows("order_payments")).toEqual([
      expect.objectContaining({ order_id: order.id, type: "charge", amount: PAIR_QUOTE, stripe_object_id: pi }),
    ]);
    const deducted = f.rows("inventory_transactions");
    expect(new Set(deducted.map((t) => (t.metadata as Row).result_id))).toEqual(new Set([ANCHOR, COMP]));

    // A repeat accept (either id) is idempotent: same Order, no new capture.
    const again = await accept(COMP);
    expect(again.body).toMatchObject({ ok: true, status: "captured", orderId: order.id });
    expect(f.stripe.calls.capture).toHaveLength(1);
    expect(orders()).toHaveLength(1);
  });

  it("refund and dispute webhooks find exactly one Order for the pair's intent", async () => {
    await pairAssigned();
    expect((await accept()).status).toBe(200);
    const pi = String(R(ANCHOR).payment_intent_id);
    const matches = f.rows("orders").filter((o) => o.payment_reference === pi);
    expect(matches).toHaveLength(1);

    const refunded = await webhook({
      id: "evt_refund",
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_1",
          payment_intent: pi,
          amount_refunded: 1000,
          refunds: { data: [{ id: "re_1", amount: 1000, status: "succeeded", currency: "sgd", metadata: {} }] },
        },
      },
    });
    expect(refunded.status).toBe(200);
    expect(f.rows("order_payments").filter((p) => p.type === "refund")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Accept rules
// ---------------------------------------------------------------------------

describe("Paired build — accept", () => {
  it("refuses with 409 pair_pending while the bolster is still held; nothing moves; then works once assigned", async () => {
    await heldAndPaid();
    await assignPillow();
    const before = structuredClone(f.db.tables);

    const res = await accept();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("pair_pending");
    expect(f.stripe.calls.capture).toEqual([]);
    expect(f.db.tables.mp_config_responses).toEqual(before.mp_config_responses);
    expect(orders()).toHaveLength(0);

    // Same through the companion's id.
    expect((await accept(COMP)).status).toBe(409);

    await assignBolster();
    const ok = await accept();
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(f.stripe.calls.capture).toHaveLength(1);
    expect(goodsLines(orders()[0].id)).toHaveLength(2);
  });

  it("accept called with the companion's id resolves to the anchor", async () => {
    await pairAssigned();
    const res = await accept(COMP);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(f.stripe.calls.capture).toEqual([{ id: String(R(ANCHOR).payment_intent_id), amount: 50050 }]);
    expect(R(ANCHOR).status).toBe("captured");
    expect(R(COMP).status).toBe("captured");
  });

  it("two concurrent accepts (anchor id and companion id) make one Order and one capture", async () => {
    await pairAssigned();
    const results = await Promise.all([accept(ANCHOR), accept(COMP), accept(ANCHOR)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(f.stripe.calls.capture).toHaveLength(1);
    expect(orders()).toHaveLength(1);
    expect(f.rows("order_payments")).toHaveLength(1);
    expect(f.rows("inventory_transactions").length).toBeGreaterThan(0);
    const perResult = new Set(f.rows("inventory_transactions").map((t) => `${(t.metadata as Row).result_id}:${t.item_id}`));
    expect(perResult.size).toBe(f.rows("inventory_transactions").length);
  });

  it("STOCK: a failed stock write after capture is retried, and the builds are deducted once", async () => {
    await pairAssigned();
    f.db.faults.push({ table: "inventory_transactions", op: "insert", error: { code: "XX000", message: "connection reset" } });
    const res = await accept();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const order = orders()[0];
    expect(order.inventory_deducted_at).toBeTruthy();
    expect(order.needs_attention).toBeFalsy();
    const deducted = f.rows("inventory_transactions");
    expect(new Set(deducted.map((t) => (t.metadata as Row).result_id))).toEqual(new Set([ANCHOR, COMP]));
    expect(deducted.every((t) => (t.metadata as Row).order_id === order.id && (t.metadata as Row).role)).toBe(true);
  });

  it("STOCK: when every stock write fails the Order is flagged, unclaimed, and Staff's Deduct stock takes it once", async () => {
    await pairAssigned();
    for (let i = 0; i < 3; i++) {
      f.db.faults.push({ table: "inventory_transactions", op: "insert", error: { code: "XX000", message: "connection reset" } });
    }
    expect((await accept()).status).toBe(200);
    const order = orders()[0];
    expect(order.needs_attention).toBe(true);
    expect(order.inventory_deducted_at ?? null).toBeNull();
    expect(f.rows("inventory_transactions")).toEqual([]);
    expect(f.rows("order_timeline").some((e) => e.order_id === order.id && e.event_type === "stock_not_deducted")).toBe(true);

    const { deductOrderStock } = await import("@/lib/ecommerce/order-stock");
    const admin = f.fakeAdmin as unknown as Parameters<typeof deductOrderStock>[0];
    expect(await deductOrderStock(admin, String(order.id))).toBe("deducted");
    expect(await deductOrderStock(admin, String(order.id))).toBe("already_deducted");
    const deducted = f.rows("inventory_transactions");
    expect(new Set(deducted.map((t) => (t.metadata as Row).result_id))).toEqual(new Set([ANCHOR, COMP]));
    expect(new Set(deducted.map((t) => `${(t.metadata as Row).result_id}:${t.item_id}`)).size).toBe(deducted.length);
  });

  it("'Remove Mbolster' (decline the companion) keeps the hold; accept captures only the pillow's final", async () => {
    await pairAssigned();
    const pi = String(R(ANCHOR).payment_intent_id);
    const rm = await decline(COMP);
    expect(rm.status, JSON.stringify(rm.body)).toBe(200);
    expect(rm.body.holdReleased).toBe(false);
    expect(f.stripe.calls.cancel).toEqual([]);
    expect(R(COMP).status).toBe("declined");
    expect(R(ANCHOR).status).toBe("assigned");
    expect(f.stripe.intents.get(pi)!.status).toBe("requires_capture");

    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(f.stripe.calls.capture).toEqual([{ id: pi, amount: 33700 }]);
    // Stripe frees the uncaptured Mbolster share.
    expect(f.stripe.intents.get(pi)).toMatchObject({ amount_received: 33700, released: 16350 });
    const order = orders()[0];
    expect(order).toMatchObject({ total: PILLOW_QUOTE, amount_captured: PILLOW_QUOTE, shipping_amount: 10 });
    expect(goodsLines(order.id)).toHaveLength(1);
    expect(R(COMP)).toMatchObject({ status: "declined", order_id: null });
  });

  it("top-up when the pair's finals exceed the authorized sum, then the return-from-top-up accept", async () => {
    await heldAndPaid();
    // Costings moved between hold and assign.
    h.pillowBase = 350;
    await assignPillow();
    await assignBolster();
    const pillowFinal = 350 + 10 + 31.5; // 391.5
    expect(R(ANCHOR).final_amount).toBe(pillowFinal);
    const pairFinal = pillowFinal + BOLSTER_QUOTE; // 555
    const pi = String(R(ANCHOR).payment_intent_id);

    const first = await accept();
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body).toMatchObject({ needsTopUp: true, topUpAmount: 54.5, authorizedAmount: PAIR_QUOTE, finalAmount: pairFinal });
    expect(f.stripe.calls.capture).toEqual([]);
    expect(R(ANCHOR).status).toBe("assigned");

    // Shopper pays the Balance payment; the webhook stamps it on the anchor.
    const topup = f.completeCheckout(String(first.body.sessionId));
    expect(topup.metadata).toMatchObject({ result_id: ANCHOR, purpose: "result_topup" });
    await webhook(f.sessionEvent(topup));
    expect(R(ANCHOR).topup_payment_intent_id).toBe(topup.payment_intent);

    const back = await accept(ANCHOR, { topupSessionId: topup.id });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect(f.stripe.calls.capture).toEqual([{ id: pi, amount: 50050 }]);
    const order = orders()[0];
    expect(order).toMatchObject({ total: pairFinal, amount_captured: pairFinal, payment_reference: pi });
    expect(f.rows("order_payments").map((p) => [p.stripe_object_id, p.amount])).toEqual([
      [pi, PAIR_QUOTE],
      [topup.payment_intent, 54.5],
    ]);
  });

  it("MONEY: once a Balance payment is paid for the pair, 'Remove Mbolster' is refused and accept settles every cent", async () => {
    await heldAndPaid();
    h.pillowBase = 350;
    await assignPillow();
    await assignBolster();
    const first = await accept();
    expect(first.body.needsTopUp).toBe(true);
    const topup = f.completeCheckout(String(first.body.sessionId));
    await webhook(f.sessionEvent(topup)); // money taken: 54.50 on a second intent
    expect(f.stripe.intents.get(String(topup.payment_intent))!.amount_received).toBe(5450);

    // Shopper never made it back; later opens the status page and tries to drop
    // the Mbolster. The money for both has moved, so that is refused.
    const rm = await decline(COMP);
    expect(rm.status).toBe(409);
    expect(rm.body).toMatchObject({ code: "pair_paid" });
    expect(R(COMP).status).toBe("assigned");
    const acc = await accept();
    expect(acc.status).toBe(200);

    // Everything the shopper paid must end up on the Order (or be refunded).
    const order = orders()[0];
    const paid = f.stripe.calls.capture.reduce((t, c) => t + c.amount, 0) + 5450;
    const ledgered = f.rows("order_payments").reduce((t, p) => t + Math.round(Number(p.amount) * 100), 0);
    expect(ledgered, "money charged to the card but absent from the Order's ledger").toBe(paid);
    expect(Math.round(Number(order.amount_captured) * 100)).toBe(paid);
  });
});

// ---------------------------------------------------------------------------
// Endings
// ---------------------------------------------------------------------------

describe("Paired build — endings", () => {
  it("decline the anchor → companion declined too, the intent cancelled exactly once", async () => {
    await pairAssigned();
    const pi = String(R(ANCHOR).payment_intent_id);
    const res = await decline(ANCHOR);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.holdReleased).toBe(true);
    expect(f.stripe.calls.cancel).toEqual([pi]);
    expect(R(ANCHOR).status).toBe("declined");
    expect(R(COMP).status).toBe("declined");
    // The customer is told the whole hold (both builds) was released.
    const mail = h.emails.at(-1)!;
    expect(plain(mail.text)).toContain("500.50");
    // The companion can no longer be declined/accepted into money.
    expect((await decline(COMP)).status).toBe(400);
    expect((await accept(COMP)).status).toBe(400);
    expect(f.stripe.calls.capture).toEqual([]);
  });

  it("decline the anchor while the companion is still held → both end, one release", async () => {
    await heldAndPaid();
    await assignPillow();
    const res = await decline(ANCHOR);
    expect(res.status).toBe(200);
    expect(R(COMP).status).toBe("declined");
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });

  it("Staff cancel of the companion keeps the hold for the anchor; accept then captures the pillow only", async () => {
    await heldAndPaid();
    await assignPillow();
    const res = await cancel(COMP);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ holdReleased: false, pairedCancelled: null });
    expect(f.stripe.calls.cancel).toEqual([]);
    expect(R(ANCHOR).status).toBe("assigned");
    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(f.stripe.calls.capture).toEqual([{ id: String(R(ANCHOR).payment_intent_id), amount: 33700 }]);
  });

  it("Staff cancel of the anchor cancels the companion and releases once", async () => {
    await pairAssigned();
    const res = await cancel(ANCHOR);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ holdReleased: true, pairedCancelled: COMP });
    expect(R(COMP).status).toBe("cancelled");
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });

  it("force-cancel of the anchor when the authorization already lapsed still ends the pair", async () => {
    await pairAssigned();
    f.lapseIntent(String(R(ANCHOR).payment_intent_id));
    const refused = await cancel(ANCHOR);
    expect(refused.status).toBe(502);
    expect(refused.body.canForce).toBe(true);
    expect(R(ANCHOR).status).toBe("assigned");
    expect(R(COMP).status).toBe("assigned");

    const forced = await cancel(ANCHOR, { force: true });
    expect(forced.status).toBe(200);
    expect(forced.body).toMatchObject({ holdReleased: false, pairedCancelled: COMP });
    expect(R(ANCHOR).status).toBe("cancelled");
    expect(R(COMP).status).toBe("cancelled");
  });

  it("deleting the anchor releases once and ends the companion (no live companion left with a dead hold)", async () => {
    await pairAssigned();
    const res = await deleteResult(ANCHOR);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(R(ANCHOR)).toBeUndefined();
    expect(f.stripe.calls.cancel).toHaveLength(1);
    expect(R(COMP).status).toBe("cancelled");
  });

  it("deleting the companion keeps the hold for the anchor", async () => {
    await pairAssigned();
    const res = await deleteResult(COMP);
    expect(res.status).toBe(200);
    expect(f.stripe.calls.cancel).toEqual([]);
    expect(R(ANCHOR).status).toBe("assigned");
    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(f.stripe.calls.capture).toEqual([{ id: String(R(ANCHOR).payment_intent_id), amount: 33700 }]);
    expect(orders()[0].amount_captured).toBe(PILLOW_QUOTE);
  });
});

// ---------------------------------------------------------------------------
// Webhook / status-page attach
// ---------------------------------------------------------------------------

describe("Paired build — attach", () => {
  it("a session whose amount is not the pair's sum is refused, nothing attached, the intent released", async () => {
    await holdPair();
    const s = f.stripe.sessions.get(lastSessionId())!;
    s.amount_total = 33700; // e.g. an old pillow-only session for this Result
    const paid = f.completeCheckout(s.id);
    const res = await webhook(f.sessionEvent(paid));
    expect(res.status).toBe(200);
    expect(R(ANCHOR).payment_intent_id).toBeNull();
    expect(R(COMP).payment_intent_id).toBeNull();
    expect(f.stripe.calls.cancel).toEqual([paid.payment_intent]);
    expect(f.rows("stripe_webhook_failures")).toHaveLength(1);
  });

  it("status-page sync before the webhook attaches both; the late webhook is a no-op", async () => {
    await holdPair();
    const paid = f.completeCheckout(lastSessionId());
    const st = await status(ANCHOR, `&session_id=${paid.id}`);
    expect(st.status).toBe(200);
    expect(R(ANCHOR).payment_intent_id).toBe(paid.payment_intent);
    expect(R(COMP).payment_intent_id).toBe(paid.payment_intent);
    const wh = await webhook(f.sessionEvent(paid));
    expect(wh.status).toBe(200);
    expect(f.stripe.calls.cancel).toEqual([]);
    expect(f.rows("stripe_webhook_failures")).toHaveLength(0);
  });

  it("webhook before the status-page sync: the sync is a no-op", async () => {
    await holdPair();
    const paid = f.completeCheckout(lastSessionId());
    await webhook(f.sessionEvent(paid));
    const st = await status(ANCHOR, `&session_id=${paid.id}`);
    expect(st.status).toBe(200);
    expect(R(COMP).payment_intent_id).toBe(paid.payment_intent);
    expect(f.stripe.calls.cancel).toEqual([]);
  });

  it("the companion's status page with the session id does not attach anything on its own", async () => {
    await holdPair();
    const paid = f.completeCheckout(lastSessionId());
    await status(COMP, `&session_id=${paid.id}`);
    expect(R(COMP).payment_intent_id).toBeNull();
    expect(R(ANCHOR).payment_intent_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Re-submits
// ---------------------------------------------------------------------------

describe("Paired build — re-submits", () => {
  it("re-submit after a cancelled Checkout reuses the companion id; the old session is refused if paid later", async () => {
    await holdPair();
    const oldSession = lastSessionId();
    // Shopper changes the bolster's add-on and re-submits.
    const res = await holdPair({}, { addonLines: [{ item_id: 60, quantity: 1 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(f.rows("mp_config_responses").filter((r) => r.paired_build_id === ANCHOR)).toHaveLength(2);
    expect(R(COMP).addon_lines).toEqual([{ item_id: 60, quantity: 1 }]);
    const newSession = lastSessionId();
    expect(newSession).not.toBe(oldSession);

    // Paying the OLD session (different sum) is refused and released.
    const stale = f.completeCheckout(oldSession);
    await webhook(f.sessionEvent(stale));
    expect(R(ANCHOR).payment_intent_id).toBeNull();
    expect(f.stripe.calls.cancel).toEqual([stale.payment_intent]);

    const fresh = f.completeCheckout(newSession);
    await webhook(f.sessionEvent(fresh));
    expect(R(ANCHOR).payment_intent_id).toBe(fresh.payment_intent);
    expect(R(COMP).payment_intent_id).toBe(fresh.payment_intent);
  });

  it("an honest retry of the same build replays the same Checkout session", async () => {
    await holdPair();
    await holdPair();
    expect(f.stripe.sessions.size).toBe(1);
  });

  it("re-submit with Skip deletes the old unpaid companion and unpairs the anchor", async () => {
    await holdPair();
    const res = await holdSkip();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(R(COMP)).toBeUndefined();
    expect(R(ANCHOR)).toMatchObject({ paired_build_id: null, authorized_amount: PILLOW_QUOTE });
    expect((R(ANCHOR).recommendation_record as Row).flowRouteDecision).toBe("declined");
    expect(f.stripe.sessions.get(lastSessionId())!.amount_total).toBe(33700);
  });

  it("a companion id belonging to an unrelated Result → 409 and nothing is written or charged", async () => {
    f.rows("mp_config_responses").push({
      id: STRANGER,
      status: "held",
      product_type: "bolster",
      paired_build_id: null,
      payment_intent_id: null,
      access_token: "99999999-9999-4999-8999-999999999999",
    });
    const before = structuredClone(f.rows("mp_config_responses"));
    const res = await holdPair({}, { responseId: STRANGER });
    expect(res.status).toBe(409);
    expect(sessionsCreated()).toHaveLength(0);
    expect(f.rows("mp_config_responses")).toEqual(before);
  });

  it("a companion id that is a stranger's still-unsubmitted Draft → 409", async () => {
    f.rows("mp_config_responses").push({
      id: STRANGER,
      status: null,
      product_type: "pillow",
      paired_build_id: null,
      payment_intent_id: null,
      access_token: "99999999-9999-4999-8999-999999999999",
    });
    const res = await holdPair({}, { responseId: STRANGER });
    expect(res.status).toBe(409);
    expect(R(STRANGER)).toMatchObject({ status: null, product_type: "pillow" });
  });

  it("a paid pair cannot be re-submitted (anchor gate), and its companion cannot be hijacked by another anchor", async () => {
    await heldAndPaid();
    expect((await holdPair()).status).toBe(409);
    // A different Mpillow session naming this companion id.
    f.rows("mp_config_responses").push({
      ...structuredClone(f.row("mp_config_responses", ANCHOR) as Row),
      id: STRANGER,
      status: null,
      payment_intent_id: null,
      paired_build_id: null,
    });
    const res = await hold(pairedHoldBody(pillowHold({ responseId: STRANGER }), bolster() as never));
    expect(res.status).toBe(409);
    expect(R(COMP).paired_build_id).toBe(ANCHOR);
  });

  it("MONEY: a re-submitted ended anchor with a NEW companion id unlinks the old one; accept still waits for the live one", async () => {
    // Pair held and paid, then the shopper declines everything (anchor + companion declined).
    await pairAssigned();
    await decline(ANCHOR);
    expect(R(COMP).status).toBe("declined");
    // The hold route lets a declined Result be re-submitted (pre-existing). The
    // pair comes back with a freshly minted companion id.
    const res = await holdPair({}, { responseId: COMP2 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const companions = f.rows("mp_config_responses").filter((r) => r.paired_build_id === ANCHOR && r.id !== ANCHOR);
    // One companion per anchor: the ended one stays as a record, unlinked.
    expect(companions.map((c) => [c.id, c.status])).toEqual([[COMP2, "held"]]);
    expect(R(COMP)).toMatchObject({ status: "declined", paired_build_id: null });
    const session = f.completeCheckout(lastSessionId());
    await webhook(f.sessionEvent(session));
    expect(R(COMP2).payment_intent_id).toBe(session.payment_intent);
    await assignPillow();
    // The new Mbolster is still being built: accept must refuse (pair_pending).
    const acc = await accept();
    expect(acc.status, `accept went through with a held companion: ${JSON.stringify(acc.body)}`).toBe(409);
  });
});

// ---------------------------------------------------------------------------
// SLA cron
// ---------------------------------------------------------------------------

describe("Paired build — SLA cron", () => {
  const DAY = 24 * 60 * 60 * 1000;

  it("both rows assigned at 7+ days → one release, both expired, no errors", async () => {
    await pairAssigned();
    vi.setSystemTime(new Date(T0.getTime() + 7 * DAY + 60_000));
    const res = await cron();
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(R(ANCHOR).status).toBe("expired");
    expect(R(COMP).status).toBe("expired");
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });

  it("same, with the companion row scanned first: still one release and both expired", async () => {
    await pairAssigned();
    const t = f.db.tables.mp_config_responses;
    f.db.tables.mp_config_responses = [...t.filter((r) => r.id === COMP), ...t.filter((r) => r.id !== COMP)];
    vi.setSystemTime(new Date(T0.getTime() + 7 * DAY + 60_000));
    const res = await cron();
    expect(res.body.errors).toEqual([]);
    expect(R(ANCHOR).status).toBe("expired");
    expect(R(COMP).status).toBe("expired");
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });

  it("mixed: anchor assigned, companion held past its SLA — companion expires alone, the hold stays", async () => {
    await heldAndPaid();
    await assignPillow();
    // 5 working days later the unreviewed Mbolster expires; the Mpillow is still live.
    vi.setSystemTime(new Date(T0.getTime() + 5 * DAY + 60_000));
    const res = await cron();
    expect(res.body.errors).toEqual([]);
    expect(R(COMP).status).toBe("expired");
    expect(R(ANCHOR).status).toBe("assigned");
    expect(f.stripe.calls.cancel).toEqual([]);
    expect(intentOf(ANCHOR).status).toBe("requires_capture");
  });

  it("COPY: the companion's own expiry email must not tell the customer their hold was released while the Mpillow still holds it", async () => {
    await heldAndPaid();
    await assignPillow();
    vi.setSystemTime(new Date(T0.getTime() + 5 * DAY + 60_000));
    h.emails = [];
    await cron();
    expect(f.stripe.calls.cancel).toEqual([]);
    const toCustomer = h.emails.filter((e) => e.to === "ada@x.test");
    for (const e of toCustomer) {
      expect(e.text, `email "${e.subject}" claims a release that did not happen`).not.toMatch(/hold has been released/i);
    }
  });

  it("mixed at 7+ days: anchor assigned, companion held → one release, both expired, no errors", async () => {
    await heldAndPaid();
    await assignPillow();
    vi.setSystemTime(new Date(T0.getTime() + 7 * DAY + 60_000));
    const res = await cron();
    expect(res.body.errors).toEqual([]);
    expect(R(ANCHOR).status).toBe("expired");
    expect(R(COMP).status).toBe("expired");
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });

  it("payment reminders go to the anchor only and quote both builds", async () => {
    await pairAssigned();
    vi.setSystemTime(new Date(T0.getTime() + 3 * DAY + 60_000));
    h.emails = [];
    const res = await cron();
    expect(res.body.errors).toEqual([]);
    expect(res.body.paymentReminded).toBe(1);
    const reminders = h.emails.filter((e) => e.to === "ada@x.test");
    expect(reminders).toHaveLength(1);
    expect(plain(reminders[0].text)).toContain(`/results/${ANCHOR}`);
    expect(plain(reminders[0].text)).toContain("500.50");
    expect(R(ANCHOR).payment_reminder_count).toBe(1);
    expect(R(COMP).payment_reminder_count).toBe(0);
  });

  it("COPY: no payment reminder invites an Accept that would be refused (companion still held)", async () => {
    await heldAndPaid();
    await assignPillow();
    vi.setSystemTime(new Date(T0.getTime() + 3 * DAY + 60_000));
    h.emails = [];
    await cron();
    // An Accept right now is refused with pair_pending...
    expect((await accept()).status).toBe(409);
    // ...so the customer should not have been chased to accept/pay.
    expect(h.emails.filter((e) => e.to === "ada@x.test")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Assigned email
// ---------------------------------------------------------------------------

describe("Paired build — the assigned email", () => {
  it("waits for the second build, and is sent once both are assigned (bolster assigned first)", async () => {
    await heldAndPaid();
    await assignBolster();
    expect(h.emails.filter((e) => /ready/i.test(e.subject))).toHaveLength(0);
    await assignPillow();
    const ready = h.emails.filter((e) => /ready/i.test(e.subject));
    expect(ready).toHaveLength(1);
    expect(plain(ready[0].text)).toContain(`/results/${ANCHOR}?token=`);
    expect(plain(ready[0].text)).toContain("500.50");
  });

  it("COPY: when the held companion ends instead (Staff cancel), the Mpillow's assigned email is still sent", async () => {
    await heldAndPaid();
    await assignPillow(); // suppressed: the Mbolster is still being built
    await cancel(COMP); // ...and then it never will be
    const ready = h.emails.filter((e) => /ready/i.test(e.subject));
    expect(ready, "the customer is never told their Mpillow is ready to accept").toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Holds switched off
// ---------------------------------------------------------------------------

describe("Paired build — holds switched off", () => {
  it("no Checkout; the pair settles by one Balance payment at accept", async () => {
    f.rows("site_settings").push({ key: "results_auth_hold_enabled", value: "false" });
    const res = await holdPair();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.checkoutUrl).toBeNull();
    expect(sessionsCreated()).toHaveLength(0);
    expect(R(ANCHOR)).toMatchObject({ authorized_amount: null, payment_intent_id: null, paired_build_id: ANCHOR });
    expect(R(COMP)).toMatchObject({ authorized_amount: null, payment_intent_id: null });

    await assignPillow();
    await assignBolster();
    const ready = h.emails.filter((e) => /ready/i.test(e.subject));
    expect(ready).toHaveLength(1);
    expect(ready[0].subject).toMatch(/payment due/i);

    const first = await accept();
    expect(first.body).toMatchObject({ needsTopUp: true, topUpAmount: PAIR_QUOTE });
    const topup = f.completeCheckout(String(first.body.sessionId));
    await webhook(f.sessionEvent(topup));
    const done = await accept(ANCHOR, { topupSessionId: topup.id });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(f.stripe.calls.capture).toEqual([]);
    const order = orders()[0];
    expect(order).toMatchObject({ total: PAIR_QUOTE, amount_captured: PAIR_QUOTE, payment_reference: topup.payment_intent, shipping_amount: 10 });
    expect(goodsLines(order.id)).toHaveLength(2);
    expect(R(COMP)).toMatchObject({ status: "captured", order_id: order.id });
  });
});

// ---------------------------------------------------------------------------
// Regression: unpaired Results
// ---------------------------------------------------------------------------

describe("Regression — unpaired Results behave as before", () => {
  it("an unpaired Mpillow (Skip): hold → webhook → assign → accept; decline releases", async () => {
    await heldAndPaid({ skip: true });
    expect(f.rows("mp_config_responses")).toHaveLength(1);
    expect(R(ANCHOR)).toMatchObject({ paired_build_id: null, authorized_amount: PILLOW_QUOTE });
    expect(f.stripe.sessions.get(lastSessionId())!.line_items).toEqual([{ name: "Mpillow M premium hold", amount: 33700 }]);
    await assignPillow();
    expect(h.emails.filter((e) => /ready/i.test(e.subject))).toHaveLength(1);
    const st = await status(ANCHOR);
    expect(st.body.result.paired).toBeNull();
    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(f.stripe.calls.capture).toEqual([{ id: String(R(ANCHOR).payment_intent_id), amount: 33700 }]);
    expect(orders()[0]).toMatchObject({ total: PILLOW_QUOTE, shipping_amount: 10 });
  });

  it("an unpaired Mpillow decline releases its hold", async () => {
    await heldAndPaid({ skip: true });
    await assignPillow();
    const res = await decline(ANCHOR);
    expect(res.body.holdReleased).toBe(true);
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });

  it("an unpaired Mbolster (standalone page): charges its own shipping, accepts alone", async () => {
    const res = await hold({
      responseId: BOLSTER_ALONE,
      email: "bo@x.test",
      phone: "91234567",
      discoverySource: "instagram",
      productType: "bolster",
      suggestedLength: "medium",
      measurements: { height_cm: 170 },
      preferenceLines: [{ item_id: 3, quantity: 1, category: "case" }],
      shippingMethodId: SHIP,
      shippingAddress: { recipient: "Bo", line1: "2 Road", city: "Singapore", postal_code: "123457", country: "SG" },
      recommendationRecord: { flow: "mbolster", size: "medium" },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(R(BOLSTER_ALONE)).toMatchObject({ paired_build_id: null, authorized_amount: 150 + 10 + 13.5 });
    const s = f.completeCheckout(lastSessionId());
    await webhook(f.sessionEvent(s));
    const a = await asStaff(() =>
      call(assignRoute.POST(new Request(`${BASE}/api/results/${BOLSTER_ALONE}/assign`, json({ assignedLength: "medium", fillingTemplateId: 8 })), params(BOLSTER_ALONE))),
    );
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(R(BOLSTER_ALONE).final_amount).toBe(173.5);
    const acc = await call(
      acceptRoute.POST(
        new Request(`${BASE}/api/results/${BOLSTER_ALONE}/accept`, json({ token: R(BOLSTER_ALONE).access_token })),
        params(BOLSTER_ALONE),
      ),
    );
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(orders()[0]).toMatchObject({ total: 173.5, shipping_amount: 10 });
    expect(f.stripe.calls.capture).toEqual([{ id: s.payment_intent, amount: 17350 }]);
  });

  it("an unpaired Mpillow's SLA expiry releases its own hold", async () => {
    await heldAndPaid({ skip: true });
    await assignPillow();
    vi.setSystemTime(new Date(T0.getTime() + 7 * 24 * 60 * 60 * 1000 + 60_000));
    const res = await cron();
    expect(res.body.errors).toEqual([]);
    expect(R(ANCHOR).status).toBe("expired");
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Adversarial: money paths that change between steps
// ---------------------------------------------------------------------------

describe("Paired build — adversarial money paths", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const cents = (n: unknown) => Math.round(Number(n) * 100);
  /** What Stripe actually took from the card, across every intent. */
  const takenFromCard = () => [...f.stripe.intents.values()].reduce((t, pi) => t + pi.amount_received, 0);
  const ledgered = () => f.rows("order_payments").reduce((t, p) => t + cents(p.amount), 0);
  const round = (n: number) => Math.round(n * 100) / 100;

  it("MONEY: accept captures, then fails writing the Order; 'Remove Mbolster' is refused and the retry records every cent", async () => {
    await pairAssigned();
    const pi = String(R(ANCHOR).payment_intent_id);
    f.db.faults.push({ table: "order_items", op: "insert", error: { code: "XX000", message: "connection reset" } });
    const failed = await accept();
    expect(failed.status).toBe(500);
    expect(f.stripe.intents.get(pi)!.amount_received).toBe(50050); // money already taken
    expect(R(ANCHOR).status).toBe("assigned"); // claim handed back for a retry
    expect(R(COMP).status).toBe("assigned");

    // The hold is already captured for both: dropping the Mbolster is refused.
    const rm = await decline(COMP);
    expect(rm.status).toBe(409);
    expect(rm.body).toMatchObject({ code: "pair_paid" });

    const retry = await accept();
    expect(retry.status).toBe(200);
    expect(f.stripe.calls.capture).toHaveLength(1);
    // The Order must account for every cent the intent captured.
    expect(ledgered(), "captured on Stripe but missing from the Order").toBe(takenFromCard());
  });

  it("MONEY: an old, larger Balance payment paid after 'Remove Mbolster' is never settled as-is — it stops for a human", async () => {
    await heldAndPaid();
    h.pillowBase = 500; // the pillow alone now exceeds the whole pair hold
    await assignPillow();
    await assignBolster();
    const pillowFinal = 500 + 10 + 45; // 555
    const first = await accept();
    expect(first.body).toMatchObject({ needsTopUp: true, topUpAmount: round(pillowFinal + BOLSTER_QUOTE - PAIR_QUOTE) });

    // Shopper drops the Mbolster, then pays the OLD (pair) Balance payment session.
    expect((await decline(COMP)).status).toBe(200);
    const oldTopup = f.completeCheckout(String(first.body.sessionId));
    await webhook(f.sessionEvent(oldTopup));
    // What was paid no longer matches the order: no Order, no hold capture, and
    // the row stays assigned with the payment stamped — the queue's
    // topup_unsettled alarm — for Staff to settle or refund.
    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(409);
    expect(acc.body).toMatchObject({ code: "paid_mismatch" });
    expect(orders()).toHaveLength(0);
    expect(f.stripe.calls.capture).toHaveLength(0);
    expect(R(ANCHOR)).toMatchObject({ status: "assigned", order_id: null });
    expect(R(ANCHOR).topup_paid_at).toBeTruthy();
  });

  it("MONEY: the cron expires a companion the shopper already paid a Balance payment for", async () => {
    await heldAndPaid();
    h.pillowBase = 350;
    await assignPillow();
    await assignBolster();
    const first = await accept();
    const topup = f.completeCheckout(String(first.body.sessionId));
    await webhook(f.sessionEvent(topup));
    expect(R(ANCHOR).topup_paid_at).toBeTruthy();

    vi.setSystemTime(new Date(T0.getTime() + 7 * DAY + 60_000));
    const res = await cron();
    expect(res.body.errors).toEqual([]);
    // "Money already moved is never expired here" — the anchor is left for a human...
    expect(R(ANCHOR).status).toBe("assigned");
    // ...but the Mbolster that money paid for must not be expired out from under it.
    expect(R(COMP).status, "a paid-for companion was expired").toBe("assigned");
  });

  it("decline of the companion racing an accept never leaves a 'removed' Mbolster charged", async () => {
    await pairAssigned();
    const [acc, rm] = await Promise.all([accept(), decline(COMP)]);
    const capturedCents = f.stripe.calls.capture.reduce((t, c) => t + c.amount, 0);
    if (rm.status === 200) {
      // The shopper was told "You will not be charged for it."
      expect(capturedCents).toBeLessThanOrEqual(33700);
      expect(R(COMP).status).not.toBe("captured");
    }
    if (acc.status === 200 && capturedCents === 50050) expect(rm.status).not.toBe(200);
  });

  it("decline of the companion arriving between accept's claim and its capture", async () => {
    await pairAssigned();
    // Hold the capture open until the decline has run.
    const realCapture = f.fakeStripeClient.paymentIntents.capture;
    let declined: { status: number } | null = null;
    f.fakeStripeClient.paymentIntents.capture = async (id: string, p?: { amount_to_capture?: number }) => {
      declined = await decline(COMP);
      return realCapture(id, p);
    };
    try {
      const acc = await accept();
      expect(acc.status).toBe(200);
    } finally {
      f.fakeStripeClient.paymentIntents.capture = realCapture;
    }
    expect(declined!.status, "decline must refuse a companion already claimed by accept").toBe(400);
    expect(R(COMP).status).toBe("captured");
  });

  it("Staff cancel the still-unpaid companion before Checkout completes: the Mpillow's card must survive", async () => {
    await holdPair();
    // The companion shows in the queue as soon as the hold is written.
    const c = await cancel(COMP);
    expect(c.status).toBe(200);
    const paid = f.completeCheckout(lastSessionId());
    await webhook(f.sessionEvent(paid));
    // ADR: cancelling the companion leaves the anchor and its hold untouched.
    expect(R(ANCHOR).payment_intent_id, "the Mpillow lost its card hold because the Mbolster was cancelled").toBe(
      paid.payment_intent,
    );
  });

  it("'Remove Mbolster' with the pillow's final above its own quote: captured from the pair hold, no Balance payment", async () => {
    await heldAndPaid();
    h.pillowBase = 350; // pillow final 391.50 > its own 337 quote, < the 500.50 pair hold
    await assignPillow();
    await assignBolster();
    await decline(COMP);
    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    expect(acc.body.needsTopUp).toBeUndefined();
    expect(f.stripe.calls.capture).toEqual([{ id: String(R(ANCHOR).payment_intent_id), amount: 39150 }]);
  });

  it("no Order without money: holds off, accept without paying, or with another Result's Balance payment", async () => {
    f.rows("site_settings").push({ key: "results_auth_hold_enabled", value: "false" });
    await holdPair();
    await assignPillow();
    await assignBolster();
    const first = await accept();
    expect(first.body.needsTopUp).toBe(true);
    expect(orders()).toHaveLength(0);
    // Unpaid session → refused.
    const unpaid = await accept(ANCHOR, { topupSessionId: String(first.body.sessionId) });
    expect(unpaid.status).toBe(400);
    // A paid Balance payment that belongs to another Result → refused.
    const foreign = await fakeTopupFor(STRANGER, PAIR_QUOTE);
    const wrong = await accept(ANCHOR, { topupSessionId: foreign });
    expect(wrong.status).toBe(400);
    expect(orders()).toHaveLength(0);
    expect(R(ANCHOR).status).toBe("assigned");
    expect(R(COMP).status).toBe("assigned");
  });

  it("both rows held past the SLA: one release, both expired", async () => {
    await heldAndPaid();
    vi.setSystemTime(new Date(T0.getTime() + 5 * DAY + 60_000));
    const res = await cron();
    expect(res.body.errors).toEqual([]);
    expect(R(ANCHOR).status).toBe("expired");
    expect(R(COMP).status).toBe("expired");
    expect(f.stripe.calls.cancel).toHaveLength(1);
  });
});

describe("Paired build — Self-collect", () => {
  const SELF = "5c5c5c5c-5c5c-4c5c-8c5c-5c5c5c5c5c5c";
  const STUDIO = "57575757-5757-4757-8757-575757575757";

  beforeEach(() => {
    seed({
      shipping_methods: [
        { id: SHIP, slug: "standard", is_active: true, base_rate: 10, free_above: null, content: {} },
        {
          id: SELF,
          slug: "self-collect",
          is_active: true,
          base_rate: 0,
          free_above: null,
          content: {},
          collect_location_id: STUDIO,
        },
      ],
      partners: [
        { id: STUDIO, name: "Mpillow Singapore", type: "own", address: "512 Chai Chee Lane #02-10", postal_code: "469028" },
      ],
    });
  });

  it("asks only who collects; both builds carry the studio, and the Order waits to be handed over", async () => {
    // The configurator hides the address fields, so they arrive empty.
    const res = await holdPair({
      shippingMethodId: SELF,
      shippingAddress: { recipient: "Ada", line1: "", city: "", postal_code: "", country: "SG" },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const studioAddress = {
      recipient: "Ada",
      line1: "512 Chai Chee Lane #02-10",
      city: "Singapore",
      postal_code: "469028",
      country: "SG",
      collect_location: { id: STUDIO, name: "Mpillow Singapore" },
    };
    expect(R(ANCHOR)).toMatchObject({ shipping_method: "self-collect", shipping_address: studioAddress });
    // The Mbolster is collected with its Mpillow, and still shares its token.
    expect(R(COMP)).toMatchObject({
      shipping_method: "self-collect",
      shipping_address: studioAddress,
      access_token: TOKEN,
    });

    const session = f.completeCheckout(lastSessionId());
    expect((await webhook(f.sessionEvent(session))).status).toBe(200);
    expect((await assignPillow()).status).toBe(200);
    expect((await assignBolster()).status).toBe(200);

    const st = await status(ANCHOR);
    expect(st.body.result.collect_at).toBe("Mpillow Singapore");
    expect(st.body.result.build.pricing).toMatchObject({ shipping: 0 });
    expect(st.body.result.shipping_address).toBeUndefined();

    const acc = await accept();
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    // Not born "delivered": it is still to be built and collected.
    expect(orders()).toHaveLength(1);
    expect(orders()[0]).toMatchObject({
      status: "confirmed",
      delivered_at: null,
      shipping_amount: 0,
      shipping_address: studioAddress,
    });
  });

  it("still requires a full address for a delivery method", async () => {
    const res = await holdPair({
      shippingAddress: { recipient: "Ada", line1: "", city: "", postal_code: "", country: "SG" },
    });
    expect(res.status).toBe(400);
    expect(R(ANCHOR).status).toBeNull();
    expect(R(COMP)).toBeUndefined();
  });
});
