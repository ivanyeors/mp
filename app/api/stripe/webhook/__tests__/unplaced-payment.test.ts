import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  event: null as unknown,
  telegram: vi.fn(),
  upsertError: null as { message: string } | null,
  emails: vi.fn(),
  deduct: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => h.event } }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const fake = fakeSupabaseAdmin(h.db);
      return {
        ...fake,
        from: (table: string) =>
          Object.assign(fake.from(table), {
            upsert: async (row: Record<string, unknown>) => {
              if (h.upsertError) return { data: null, error: h.upsertError };
              (h.db[table] ??= []).push(row);
              return { data: null, error: null };
            },
          }),
        rpc: async () => ({ data: false, error: null }),
      };
    },
  };
});
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: vi.fn() }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: h.deduct }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/ecommerce/money-ledger", () => ({ recordLedgerEntry: vi.fn(), rollupOrderMoney: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: h.emails, sendRefundEmail: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: h.telegram }));
vi.mock("@/lib/shipping/schedule-labels", () => ({ scheduleAutoLabel: vi.fn(), scheduleLabelCancel: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

const linkSession = (over: Record<string, unknown> = {}) => ({
  id: "cs_link",
  status: "complete",
  payment_status: "paid",
  payment_link: "plink_product",
  payment_intent: "pi_link",
  amount_total: 4900,
  currency: "sgd",
  metadata: { supabase_product_id: "8c8c8c8c-0000-4000-8000-000000000001" },
  ...over,
});

function deliver(type: string, object: Record<string, unknown>) {
  h.event = { id: `evt_${type}`, type, data: { object } };
  return POST(
    new Request("https://x.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "sig" }, body: "{}" }),
  );
}

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  vi.clearAllMocks();
  h.telegram.mockResolvedValue("sent");
  h.upsertError = null;
  h.db = { orders: [], stripe_webhook_failures: [] };
});

describe("Stripe webhook — a paid Checkout with no Order or Result to attach it to", () => {
  it.each(["checkout.session.completed", "checkout.session.async_payment_succeeded"])(
    "%s is recorded and sent to Staff, not dropped",
    async (type) => {
      expect((await deliver(type, linkSession())).status).toBe(200);

      expect(h.db.stripe_webhook_failures).toHaveLength(1);
      const failure = h.db.stripe_webhook_failures[0];
      expect(failure).toMatchObject({ event_id: `evt_${type}`, event_type: type });
      expect(failure.error).toMatch(/SGD 49\.00/);
      expect(failure.error).toMatch(/cs_link/);
      expect(failure.error).toMatch(/plink_product/);
      expect(failure.error).toMatch(/pi_link/);
      expect(h.telegram).toHaveBeenCalledWith(failure.error);
      expect(h.db.orders).toEqual([]);
      expect(h.deduct).not.toHaveBeenCalled();
      expect(h.emails).not.toHaveBeenCalled();
    },
  );

  it("waits while a delayed payment method has not settled", async () => {
    await deliver("checkout.session.completed", linkSession({ payment_status: "unpaid" }));
    expect(h.db.stripe_webhook_failures).toEqual([]);
    expect(h.telegram).not.toHaveBeenCalled();
  });

  it.each(["failed", "skipped"])("is still recorded when the Telegram alert is %s", async (result) => {
    h.telegram.mockResolvedValue(result);
    expect((await deliver("checkout.session.completed", linkSession())).status).toBe(200);
    expect(h.db.stripe_webhook_failures).toHaveLength(1);
  });

  it("answers 200 when the row can't be written but Staff were told", async () => {
    h.upsertError = { message: "connection reset" };
    expect((await deliver("checkout.session.completed", linkSession())).status).toBe(200);
    expect(h.telegram).toHaveBeenCalledTimes(1);
  });

  it.each(["failed", "skipped"])(
    "answers 500 so Stripe retries when the row can't be written and Telegram %s",
    async (result) => {
      h.upsertError = { message: "connection reset" };
      h.telegram.mockResolvedValue(result);
      expect((await deliver("checkout.session.completed", linkSession())).status).toBe(500);
    },
  );
});
