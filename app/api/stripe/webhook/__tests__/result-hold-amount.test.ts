import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  failures: [] as Array<Record<string, unknown>>,
  event: null as unknown,
  cancel: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ webhooks: { constructEvent: () => h.event }, paymentIntents: { cancel: h.cancel } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const hit = () => [...h.rows.values()].filter((r) => filters.every((f) => f(r)));
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
        update: (p: Record<string, unknown>) => ((patch = p), b),
        upsert: async (row: Record<string, unknown>) => {
          if (table === "stripe_webhook_failures") h.failures.push(row);
          return { error: null };
        },
        maybeSingle: async () => ({ data: table === "mp_config_responses" ? hit()[0] ?? null : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          const rows = table === "mp_config_responses" ? hit() : [];
          if (patch) for (const r of rows) h.rows.set(r.id as string, { ...r, ...patch });
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: vi.fn() }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: vi.fn() }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/ecommerce/money-ledger", () => ({ recordLedgerEntry: vi.fn(), rollupOrderMoney: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: vi.fn(), sendRefundEmail: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const completed = (amountTotal: number, currency = "sgd") => {
  h.event = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_old",
        status: "complete",
        metadata: { result_id: ID },
        payment_intent: "pi_1",
        payment_status: "unpaid",
        amount_total: amountTotal,
        currency,
      },
    },
  };
  return POST(
    new Request("https://x.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
};

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  h.failures.length = 0;
  h.cancel.mockReset().mockResolvedValue({});
  h.rows.clear();
  h.rows.set(ID, {
    id: ID,
    status: "held",
    authorized_amount: 200,
    currency: "SGD",
    payment_intent_id: null,
  });
});

describe("Stripe webhook — Result authorization hold", () => {
  it("attaches the card when the session authorised the amount the Result quotes", async () => {
    const res = await completed(20000);
    expect(res.status).toBe(200);
    expect(h.rows.get(ID)?.payment_intent_id).toBe("pi_1");
    expect(h.failures).toEqual([]);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("does not attach a session for a different amount, and records it", async () => {
    const res = await completed(15000);
    expect(res.status).toBe(200);
    expect(h.rows.get(ID)?.payment_intent_id).toBeNull();
    expect(h.failures).toHaveLength(1);
    expect(h.cancel).toHaveBeenCalledWith("pi_1");
  });

  it("never replaces a card already attached (the status page may have synced it first)", async () => {
    h.rows.set(ID, { ...h.rows.get(ID), payment_intent_id: "pi_first" });
    await completed(20000);
    expect(h.rows.get(ID)?.payment_intent_id).toBe("pi_first");
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("does not attach a session in a different currency", async () => {
    await completed(20000, "usd");
    expect(h.rows.get(ID)?.payment_intent_id).toBeNull();
  });
});

describe("Stripe webhook — Paired build hold (ADR 0026)", () => {
  const COMPANION = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  beforeEach(() => {
    h.rows.set(ID, { ...h.rows.get(ID), paired_build_id: ID });
    h.rows.set(COMPANION, {
      id: COMPANION,
      status: "held",
      authorized_amount: 80,
      currency: "SGD",
      payment_intent_id: null,
      paired_build_id: ID,
    });
  });

  it("attaches one card to both Results when the session authorised their sum", async () => {
    await completed(28000);
    expect(h.rows.get(ID)?.payment_intent_id).toBe("pi_1");
    expect(h.rows.get(COMPANION)?.payment_intent_id).toBe("pi_1");
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it("refuses a session for the anchor's amount alone", async () => {
    await completed(20000);
    expect(h.rows.get(ID)?.payment_intent_id).toBeNull();
    expect(h.rows.get(COMPANION)?.payment_intent_id).toBeNull();
    expect(h.cancel).toHaveBeenCalledWith("pi_1");
  });
});
