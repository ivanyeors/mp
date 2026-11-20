import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({ db: {} as FakeDb, failInsert: false }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const admin = fakeSupabaseAdmin(h.db);
      return {
        from(table: string) {
          if (table === "drop_off_reasons" && h.failInsert) {
            return { insert: async () => ({ error: { code: "42501", message: "permission denied" } }) };
          }
          return admin.from(table);
        },
      };
    },
  };
});
vi.mock("@/lib/results/access", () => ({ authorizeResultAccess: vi.fn(async () => true) }));
vi.mock("@/lib/authorization-hold", () => ({ releaseHold: vi.fn(async () => {}) }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: vi.fn(async () => {}) }) }));
vi.mock("@/lib/email/copy-store", () => ({ loadEmailCopy: vi.fn(async () => ({})) }));
vi.mock("@/lib/email/results", () => ({
  RESULT_EMAIL_COPY: { declined: {} },
  renderResultDeclinedEmail: () => ({ subject: "s", html: "h", text: "t" }),
}));
vi.mock("@/lib/email/transport", () => ({ getDefaultFromAddress: () => "shop@x.test" }));
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: vi.fn(async () => "sent") }));

const { POST } = await import("../route");

const ID = "9e000000-0000-4000-8000-000000000001";
const TOKEN = "70000000-0000-4000-8000-000000000001";

const result = (over: Record<string, unknown> = {}) => ({
  id: ID,
  status: "assigned",
  filling_template_id: 3,
  payment_intent_id: "pi_1",
  access_token: TOKEN,
  customer_id: null,
  customer_email: "mei@example.com",
  order_id: null,
  product_type: "pillow",
  authorized_amount: 300,
  currency: "SGD",
  assigned_size: "M",
  assigned_tier: "premium",
  assigned_length: null,
  final_amount: 320,
  paired_build_id: null,
  ...over,
});

const decline = (body: Record<string, unknown>) =>
  POST(
    new Request(`https://mpillow.test/api/results/${ID}/decline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: TOKEN, ...body }),
    }),
    { params: Promise.resolve({ id: ID }) },
  );

beforeEach(() => {
  h.db = { mp_config_responses: [result()] };
  h.failInsert = false;
});

describe("decline with a reason", () => {
  it("declines, then records the answer against the Result", async () => {
    const res = await decline({ reason: { reason: "other", text: "  Bought one in store  " } });
    expect(res.status).toBe(200);
    expect(h.db.mp_config_responses![0]!.status).toBe("declined");
    expect(h.db.drop_off_reasons).toEqual([
      expect.objectContaining({
        step: "quote_decline",
        reason: "other",
        other_text: "Bought one in store",
        result_id: ID,
        visit_id: null,
        path: null,
      }),
    ]);
  });

  it("declines exactly as before without an answer", async () => {
    const res = await decline({});
    expect(res.status).toBe(200);
    expect(h.db.mp_config_responses![0]!.status).toBe("declined");
    expect(h.db.drop_off_reasons ?? []).toHaveLength(0);
  });

  it("drops a malformed answer and still declines", async () => {
    const res = await decline({ reason: { reason: "just_looking" } });
    expect(res.status).toBe(200);
    expect(h.db.mp_config_responses![0]!.status).toBe("declined");
    expect(h.db.drop_off_reasons ?? []).toHaveLength(0);
  });

  it("records nothing when the decline is refused", async () => {
    h.db = { mp_config_responses: [result({ status: "accepted", order_id: "o1" })] };
    const res = await decline({ reason: { reason: "price" } });
    expect(res.status).toBe(400);
    expect(h.db.drop_off_reasons ?? []).toHaveLength(0);
  });

  it("still declines when the answer cannot be stored", async () => {
    h.failInsert = true;
    const res = await decline({ reason: { reason: "price" } });
    expect(res.status).toBe(200);
    expect(h.db.mp_config_responses![0]!.status).toBe("declined");
  });
});
