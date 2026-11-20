import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AftercareFakeDb } from "@/lib/aftercare/__tests__/fake-db";

const h = vi.hoisted(() => ({
  db: {} as AftercareFakeDb,
  ctx: null as null | { userId: string; email: string; permissions: Set<string> },
  audit: vi.fn(),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeAftercareDb: fake } = await import("@/lib/aftercare/__tests__/fake-db");
  const { setMarketingEmailRpc: rpc } = await import("@/lib/marketing-consent/__tests__/fake-consent");
  return { supabaseAdmin: () => fake(h.db, { set_marketing_email: rpc }) };
});
vi.mock("@/lib/auth/admin", async () => {
  const { NextResponse: R } = await import("next/server");
  return {
    requireAdminContext: async (key: string) => {
      if (!h.ctx) throw R.json({ error: "Unauthorized" }, { status: 401 });
      if (!h.ctx.permissions.has(key)) throw R.json({ error: "Forbidden" }, { status: 403 });
      return h.ctx;
    },
  };
});
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/ecommerce/customers", () => ({
  findCustomerByEmail: async (email: string) => h.db.customers.find((c) => c.email === email.toLowerCase().trim()) ?? null,
  findOrCreateCustomer: async (email: string, extra: Record<string, unknown>) => {
    const found = h.db.customers.find((c) => c.email === email);
    if (found) return found;
    const row = { id: `c-${h.db.customers.length + 1}`, email, phone: null, marketing_email: "not_subscribed", ...extra };
    h.db.customers.push(row);
    return row;
  },
}));

const { POST } = await import("@/app/api/results/[id]/customer/route");

const RID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOUGHT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEFT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const post = (body: Record<string, unknown>) =>
  POST(
    new Request(`https://x.test/api/results/${RID}/customer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: RID }) },
  );

const result = () => h.db.mp_config_responses[0]!;
const customer = (email: string) => h.db.customers.find((c) => c.email === email);

function seed(row: Record<string, unknown> = {}) {
  h.db.mp_config_responses = [
    {
      id: RID,
      status: null,
      customer_id: null,
      customer_email: null,
      customer_phone: null,
      data: { name: "Anna Ow" },
      ...row,
    },
  ];
}

beforeEach(() => {
  h.audit.mockReset();
  h.ctx = { userId: "u-1", email: "staff@x.test", permissions: new Set(["results", "customers", "customers-edit"]) };
  h.db = {
    customers: [
      { id: BOUGHT, email: "jorge@x.test", first_name: "Jorge", phone: null, marketing_email: "not_subscribed", marketing_email_source: null },
      { id: LEFT, email: "left@x.test", first_name: "Lee", phone: "+6590000000", marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" },
    ],
    customer_consent_events: [],
    mp_config_responses: [],
  };
  seed();
});

describe("POST /api/results/[id]/customer — who may", () => {
  it("needs customers-edit and results", async () => {
    h.ctx!.permissions = new Set(["results", "customers"]);
    expect((await post({ mode: "link", customerId: BOUGHT, marketingEmail: true })).status).toBe(403);
    h.ctx!.permissions = new Set(["customers", "customers-edit"]);
    expect((await post({ mode: "link", customerId: BOUGHT, marketingEmail: true })).status).toBe(403);
    h.ctx = null;
    expect((await post({ mode: "link", customerId: BOUGHT, marketingEmail: true })).status).toBe(401);
    expect(result().customer_id).toBeNull();
  });
});

describe("POST /api/results/[id]/customer — link to an existing Customer", () => {
  it("a Result with no email takes the Customer and their email, and keeps their name", async () => {
    const res = await post({ mode: "link", customerId: BOUGHT, phone: "9123 4567", marketingEmail: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, customerId: BOUGHT, created: false });
    expect(result()).toMatchObject({ customer_id: BOUGHT, customer_email: "jorge@x.test", customer_phone: "+6591234567" });
    expect(customer("jorge@x.test")).toMatchObject({ first_name: "Jorge", phone: "+6591234567" });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "result.customer_link", entityId: RID }));
  });

  it("never replaces a Customer's own mobile; the Result keeps the one Staff typed", async () => {
    await post({ mode: "link", customerId: LEFT, phone: "91234567", marketingEmail: false });
    expect(customer("left@x.test")!.phone).toBe("+6590000000");
    expect(result().customer_phone).toBe("+6591234567");
  });

  it("with no mobile typed, the Result takes the Customer's", async () => {
    await post({ mode: "link", customerId: LEFT, marketingEmail: false });
    expect(result().customer_phone).toBe("+6590000000");
  });

  it("the box, ticked by default on the panel, subscribes someone nobody has asked, as customisation", async () => {
    await post({ mode: "link", customerId: BOUGHT, marketingEmail: true });
    expect(customer("jorge@x.test")).toMatchObject({ marketing_email: "subscribed", marketing_email_source: "customisation" });
  });

  it("never re-subscribes someone who unsubscribed", async () => {
    await post({ mode: "link", customerId: LEFT, marketingEmail: true });
    expect(customer("left@x.test")).toMatchObject({ marketing_email: "unsubscribed", marketing_email_source: "unsubscribe_link" });
  });

  it("a Draft whose email Staff typed can be pointed at another Customer", async () => {
    seed({ customer_email: "typo@x.test" });
    expect((await post({ mode: "link", customerId: BOUGHT, marketingEmail: false })).status).toBe(200);
    expect(result().customer_email).toBe("jorge@x.test");
  });

  it("a guest's own first-question email is never re-pointed", async () => {
    seed({ customer_email: "guest@x.test", data: { name: "Ada", configurator: "full" } });
    const res = await post({ mode: "link", customerId: BOUGHT, marketingEmail: false });
    expect(res.status).toBe(409);
    expect(result()).toMatchObject({ customer_id: null, customer_email: "guest@x.test" });
  });

  it("a held Result's email is never re-pointed", async () => {
    seed({ status: "held", customer_email: "owner@x.test" });
    expect((await post({ mode: "link", customerId: BOUGHT, marketingEmail: false })).status).toBe(409);
    expect(result().customer_email).toBe("owner@x.test");
  });

  it("a held Result with no email can be linked", async () => {
    seed({ status: "held", source: "manual" });
    expect((await post({ mode: "link", customerId: BOUGHT, marketingEmail: false })).status).toBe(200);
    expect(result()).toMatchObject({ customer_id: BOUGHT, customer_email: "jorge@x.test" });
  });

  it("an unknown Customer is a 404", async () => {
    const res = await post({ mode: "link", customerId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", marketingEmail: true });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/results/[id]/customer — create", () => {
  it("creates a Lead with the Result's name, the email and the mobile", async () => {
    const res = await post({ mode: "create", email: " New@X.test ", phone: "91234567", marketingEmail: true });
    expect(await res.json()).toEqual({ ok: true, customerId: "c-3", created: true });
    expect(customer("new@x.test")).toMatchObject({
      first_name: "Anna Ow",
      phone: "+6591234567",
      marketing_email: "subscribed",
      marketing_email_source: "customisation",
    });
    expect(result()).toMatchObject({ customer_id: "c-3", customer_email: "new@x.test", customer_phone: "+6591234567" });
  });

  it("an email a Customer already holds links them instead of making a second", async () => {
    const res = await post({ mode: "create", email: "JORGE@x.test", name: "Anna Ow", marketingEmail: false });
    expect(await res.json()).toEqual({ ok: true, customerId: BOUGHT, created: false });
    expect(h.db.customers).toHaveLength(2);
    expect(customer("jorge@x.test")!.first_name).toBe("Jorge");
  });

  it("an email is a must", async () => {
    const res = await post({ mode: "create", name: "Anna", marketingEmail: true });
    expect(res.status).toBe(400);
    expect(h.db.customers).toHaveLength(2);
  });

  it("refuses a mobile that is not one", async () => {
    const res = await post({ mode: "create", email: "new@x.test", phone: "12", marketingEmail: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "phone" });
  });

  it("a Result whose email has no Customer yet is added as one, keeping its email", async () => {
    seed({ status: "held", customer_email: "owner@x.test" });
    const res = await post({ mode: "create", marketingEmail: false });
    expect(await res.json()).toMatchObject({ ok: true, created: true });
    expect(customer("owner@x.test")).toBeTruthy();
    expect(result()).toMatchObject({ customer_email: "owner@x.test" });
  });

  it("refuses another email for a held Result before creating anyone", async () => {
    seed({ status: "held", customer_email: "owner@x.test" });
    const res = await post({ mode: "create", email: "else@x.test", marketingEmail: true });
    expect(res.status).toBe(409);
    expect(customer("else@x.test")).toBeUndefined();
  });

  it("writes nothing if the Result changed since it was read", async () => {
    const db = h.db;
    const responses = db.mp_config_responses!;
    let reads = 0;
    Object.defineProperty(db, "mp_config_responses", {
      configurable: true,
      get: () => {
        reads += 1;
        if (reads > 1) responses[0]!.status = "held";
        return responses;
      },
      set: () => {},
    });
    const res = await post({ mode: "link", customerId: BOUGHT, marketingEmail: true });
    expect(res.status).toBe(409);
    expect(responses[0]!.customer_email).toBeNull();
  });
});
