import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * A refund takes back the points its cash earned (PRD-loyalty-points slice
 * 03; ADR 0030 (m)): `charge.refunded` calls clawback_points_for_refund for
 * each refund that delivery recorded, after the Order's money is rolled up,
 * and never fails the webhook over it. What the SQL takes, and that it takes
 * once per refund id, is asserted against Postgres in
 * supabase/tests/loyalty-points/assert-03-earning.sql.
 */

const ORDER = "0b0b0b0b-0000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  event: null as unknown,
  recorded: new Set<string>(),
  steps: [] as string[],
  rpcFails: false,
}));

vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => h.event } }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => ({
      ...fakeSupabaseAdmin(h.db),
      async rpc(fn: string, args: Record<string, unknown>) {
        if (fn !== "clawback_points_for_refund") return { data: null, error: { message: `unexpected rpc ${fn}` } };
        h.steps.push(`clawback ${args.p_refund_id} ${args.p_refund_amount}`);
        if (h.rpcFails) return { data: null, error: { message: "connection reset" } };
        return { data: Math.floor(3 * Number(args.p_refund_amount)), error: null };
      },
    }),
  };
});
vi.mock("@/lib/ecommerce/money-ledger", () => ({
  recordLedgerEntry: vi.fn(async (_admin: unknown, _orderId: string, entry: { stripeObjectId: string }) => {
    if (h.recorded.has(entry.stripeObjectId)) return { recorded: false };
    h.recorded.add(entry.stripeObjectId);
    return { recorded: true };
  }),
  rollupOrderMoney: vi.fn(async () => {
    h.steps.push("rollup");
    return { status: "partially_refunded", amountRefunded: 30, amountCaptured: 100 };
  }),
}));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: vi.fn() }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: vi.fn() }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: vi.fn(), sendRefundEmail: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

const refund = (id: string, cents: number) => ({ id, amount: cents, currency: "sgd", status: "succeeded", metadata: {} });

function deliver(refunds: ReturnType<typeof refund>[]) {
  h.event = {
    id: `evt_${refunds.map((r) => r.id).join("_")}`,
    type: "charge.refunded",
    data: { object: { id: "ch_points", payment_intent: "pi_points", refunds: { data: refunds } } },
  };
  return POST(
    new Request("https://x.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  h.recorded = new Set();
  h.steps = [];
  h.rpcFails = false;
  h.db = {
    orders: [
      {
        id: ORDER,
        order_number: "MP-CLAW",
        email: "wei.ling@example.com",
        customer_id: "0b0b0b0b-1000-4000-8000-000000000001",
        currency: "SGD",
        status: "delivered",
        payment_reference: "pi_points",
        subtotal: 100,
        discount_amount: 0,
        shipping_amount: 0,
        tax_amount: 0,
        total: 100,
        coupon_id: null,
        partner_id: null,
        shipping_address: {},
        order_items: [],
      },
    ],
    stripe_webhook_failures: [],
  };
});

describe("Stripe webhook — a refund takes back its points", () => {
  it("takes back each refund this delivery recorded, after the rollup, in dollars", async () => {
    expect((await deliver([refund("re_1", 3000)])).status).toBe(200);
    expect(h.steps).toEqual(["rollup", "clawback re_1 30"]);
  });

  it("a later refund takes back only its own; a replay takes nothing", async () => {
    await deliver([refund("re_1", 3000)]);
    h.steps = [];
    // Stripe lists every refund on the charge, newest first.
    await deliver([refund("re_2", 2000), refund("re_1", 3000)]);
    expect(h.steps).toEqual(["rollup", "clawback re_2 20"]);
    h.steps = [];
    await deliver([refund("re_2", 2000), refund("re_1", 3000)]);
    expect(h.steps).toEqual([]);
  });

  it("a failed clawback is logged and the webhook still succeeds", async () => {
    h.rpcFails = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await deliver([refund("re_1", 3000)])).status).toBe(200);
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/Points not taken back for refund re_1/));
    err.mockRestore();
  });
});
