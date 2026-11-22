import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const ORDER = "0b0b0b0b-0000-4000-8000-000000000003";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  event: null as unknown,
  recorded: new Set<string>(),
  ledger: [] as Array<{ orderId: string; amount: number; stripeObjectId: string }>,
  emails: [] as Array<{ orderId: string; amountRefunded: number }>,
  rma: [] as string[],
  liveStatus: null as string | null,
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: () => h.event },
    refunds: {
      retrieve: async (id: string) => {
        const sent = (h.event as { data: { object: { id: string } } }).data.object;
        return { ...sent, id, status: h.liveStatus ?? (sent as { status: string }).status };
      },
    },
  }),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/ecommerce/money-ledger", () => ({
  recordLedgerEntry: vi.fn(
    async (_admin: unknown, orderId: string, entry: { amount: number; stripeObjectId: string }) => {
      if (h.recorded.has(entry.stripeObjectId)) return { recorded: false };
      h.recorded.add(entry.stripeObjectId);
      h.ledger.push({ orderId, amount: entry.amount, stripeObjectId: entry.stripeObjectId });
      return { recorded: true };
    },
  ),
  rollupOrderMoney: vi.fn(async () => {
    const amountRefunded = -h.ledger.reduce((t, e) => t + e.amount, 0);
    return { status: amountRefunded >= 30 ? "refunded" : "partially_refunded", amountRefunded, amountCaptured: 30 };
  }),
}));
vi.mock("@/lib/points/earn", () => ({ clawbackPointsForRefund: vi.fn(async () => ({ taken: 0 })) }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: vi.fn() }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: vi.fn() }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({
  applyRmaTransition: vi.fn(async (_admin: unknown, t: { rmaId: string }) => {
    h.rma.push(t.rmaId);
  }),
}));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/shipping/schedule-labels", () => ({ scheduleAutoLabel: vi.fn(), scheduleLabelCancel: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendOrderConfirmedEmails: vi.fn(),
  sendRefundEmail: vi.fn(async (orderId: string, _order: unknown, amountRefunded: number) => {
    h.emails.push({ orderId, amountRefunded });
  }),
}));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

let seq = 0;
function deliver(type: string, object: unknown) {
  h.event = { id: `evt_${++seq}`, type, created: 1_793_000_000, data: { object } };
  return POST(
    new Request("https://x.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

const refund = (status: string, metadata: Record<string, string> = {}) => ({
  id: "re_paynow",
  object: "refund",
  amount: 3000,
  currency: "sgd",
  status,
  charge: "ch_paynow",
  payment_intent: "pi_paynow",
  reason: "requested_by_customer",
  created: 1_793_000_000,
  metadata,
});

const chargeRefunded = (r: ReturnType<typeof refund>) => ({
  id: "ch_paynow",
  payment_intent: "pi_paynow",
  refunds: { data: [r] },
});

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  h.recorded = new Set();
  h.ledger = [];
  h.emails = [];
  h.rma = [];
  h.liveStatus = null;
  h.db = {
    orders: [
      {
        id: ORDER,
        order_number: "MP-PAYNOW",
        email: "wei.ling@example.com",
        customer_id: null,
        currency: "SGD",
        status: "confirmed",
        payment_reference: "pi_paynow",
        subtotal: 30,
        discount_amount: 0,
        shipping_amount: 0,
        tax_amount: 0,
        points_spent: 0,
        total: 30,
        coupon_id: null,
        partner_id: null,
        shipping_address: {},
        order_items: [],
      },
    ],
    order_payments: [{ id: "op-1", order_id: ORDER, type: "charge", amount: 30, stripe_object_id: "pi_paynow" }],
    stripe_webhook_failures: [],
  };
});

describe("Stripe webhook — a refund that settles later (PayNow)", () => {
  it("records nothing while pending, then settles the Order once refund.updated says succeeded", async () => {
    expect((await deliver("charge.refunded", chargeRefunded(refund("pending")))).status).toBe(200);
    expect(h.ledger).toEqual([]);
    expect(h.emails).toEqual([]);

    expect((await deliver("refund.updated", refund("succeeded"))).status).toBe(200);
    expect(h.ledger).toEqual([{ orderId: ORDER, amount: -30, stripeObjectId: "re_paynow" }]);
    expect(h.emails).toEqual([{ orderId: ORDER, amountRefunded: 30 }]);
  });

  it("a redelivered refund.updated records and emails nothing more", async () => {
    await deliver("refund.updated", refund("succeeded"));
    await deliver("refund.updated", refund("succeeded"));
    expect(h.ledger).toHaveLength(1);
    expect(h.emails).toHaveLength(1);
  });

  it.each(["pending", "requires_action", "failed", "canceled"])("refund.updated %s changes nothing", async (status) => {
    expect((await deliver("refund.updated", refund(status))).status).toBe(200);
    expect(h.ledger).toEqual([]);
    expect(h.emails).toEqual([]);
  });

  it("settles the return a refund was issued for", async () => {
    await deliver("refund.updated", refund("succeeded", { rma_request_id: "rma-7" }));
    expect(h.rma).toEqual(["rma-7"]);
  });

  it("a stale succeeded retry after the refund failed records nothing, since Stripe now says failed", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await deliver("refund.failed", { ...refund("failed"), failure_reason: "expired_or_canceled_card" });
    err.mockRestore();
    h.liveStatus = "failed";
    expect((await deliver("refund.updated", refund("succeeded"))).status).toBe(200);
    expect(h.ledger).toEqual([]);
    expect(h.emails).toEqual([]);
  });

  it("a refund on an intent no Order was paid on records nothing", async () => {
    await deliver("refund.updated", { ...refund("succeeded"), payment_intent: "pi_stranger" });
    expect(h.ledger).toEqual([]);
  });
});

describe("Stripe webhook — a card refund reported by both events", () => {
  it("records one ledger row and sends one email, in either order", async () => {
    await deliver("charge.refunded", chargeRefunded(refund("succeeded")));
    await deliver("refund.updated", refund("succeeded"));
    expect(h.ledger).toHaveLength(1);
    expect(h.emails).toHaveLength(1);

    h.recorded = new Set();
    h.ledger = [];
    h.emails = [];
    await deliver("refund.updated", refund("succeeded"));
    await deliver("charge.refunded", chargeRefunded(refund("succeeded")));
    expect(h.ledger).toHaveLength(1);
    expect(h.emails).toHaveLength(1);
  });
});
