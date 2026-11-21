import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  requireAnyAdmin: vi.fn(),
  retrieve: vi.fn(),
  loadAssignedBuild: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let patch: Record<string, unknown> | null = null;
      const run = () => {
        if (table !== "mp_config_responses") return [];
        const hit = [...h.rows.values()].filter((r) => filters.every(([c, v]) => (r[c] ?? null) === v));
        if (patch) for (const r of hit) h.rows.set(r.id as string, { ...r, ...patch });
        return hit.map((r) => ({ ...r }));
      };
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push([c, v]), b),
        is: (c: string, v: unknown) => (filters.push([c, v]), b),
        in: () => b,
        update: (p: Record<string, unknown>) => ((patch = p), b),
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(resolve),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/auth/admin", () => ({ requireAnyAdmin: h.requireAnyAdmin }));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ checkout: { sessions: { retrieve: h.retrieve } } }),
}));
vi.mock("@/lib/config-upload", () => ({ listConfigUploads: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/results/assigned-build", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/results/assigned-build")>()),
  loadAssignedBuild: h.loadAssignedBuild,
}));

const { GET } = await import("@/app/api/results/[id]/route");
const { POST: finish } = await import("@/app/api/results/[id]/finish/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "11111111-1111-4111-8111-111111111111";
const params = { params: Promise.resolve({ id: ID }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.rows.clear();
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
});

describe("GET /api/results/[id] — return from a hold Checkout", () => {
  const heldAt150 = {
    id: ID,
    status: "held",
    access_token: TOKEN,
    customer_id: null,
    customer_email: "owner@x.test",
    authorized_amount: 150,
    currency: "SGD",
    payment_intent_id: null,
  };
  const session = (over: Record<string, unknown> = {}) => ({
    id: "cs_1",
    status: "complete",
    metadata: { result_id: ID },
    payment_intent: "pi_1",
    amount_total: 15000,
    currency: "sgd",
    ...over,
  });
  const open = () =>
    GET(new Request(`https://x.test/api/results/${ID}?token=${TOKEN}&session_id=cs_1`), params);

  beforeEach(() => h.rows.set(ID, { ...heldAt150 }));

  it("attaches the card when the session authorised what the Result quotes", async () => {
    h.retrieve.mockResolvedValue(session());
    const res = await open();
    expect(res.status).toBe(200);
    expect(h.rows.get(ID)?.payment_intent_id).toBe("pi_1");
  });

  it("does not attach an older Checkout for a different amount", async () => {
    h.retrieve.mockResolvedValue(session({ id: "cs_old", payment_intent: "pi_old", amount_total: 10000 }));
    const res = await open();
    expect(res.status).toBe(200);
    expect(h.rows.get(ID)?.payment_intent_id).toBeNull();
    expect((await res.json()).result.payment_intent_id).toBeNull();
  });

  it("does not attach a Checkout the customer never completed", async () => {
    h.retrieve.mockResolvedValue(session({ status: "open" }));
    await open();
    expect(h.rows.get(ID)?.payment_intent_id).toBeNull();
  });
});

describe("POST /api/results/[id]/finish — who counts as Staff", () => {
  it("refuses a viewer without the Result token", async () => {
    h.requireAnyAdmin.mockImplementation(async (wanted: string[]) =>
      wanted.some((p) => ["orders", "analytics"].includes(p))
        ? null
        : NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    h.rows.set(ID, {
      id: ID,
      status: "assigned",
      source: "staff_assisted",
      access_token: TOKEN,
      customer_id: null,
      customer_email: "owner@x.test",
      order_id: null,
      shipping_address: null,
    });
    const res = await finish(
      new Request(`https://x.test/api/results/${ID}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferenceLines: [{ item_id: 1, quantity: 1, category: "cover" }],
          shippingMethodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          shippingAddress: { recipient: "Eve", line1: "1 Road", city: "SG", postal_code: "123456" },
        }),
      }),
      params,
    );
    expect(res.status).toBe(403);
    expect(h.loadAssignedBuild).not.toHaveBeenCalled();
  });
});
