import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
}));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/ecommerce/admin/customers", () => ({
  listAdminCustomers: () => Promise.resolve({ ok: true, rows: h.db.customers ?? [], total: 1, page: 1, limit: 20 }),
  getAdminCustomer: (id: string) =>
    Promise.resolve({ ok: true, row: (h.db.customers ?? []).find((c) => c.id === id) }),
}));

const list = await import("../route");
const one = await import("../[id]/route");
const addresses = await import("../[id]/addresses/route");

const role = (id: string, permissions: string[], grantsAll = false) => ({
  id,
  key: id,
  name: id,
  is_system: grantsAll,
  grants_all: grantsAll,
  permissions,
});

const signIn = (roleId: string) => {
  h.identity = { id: `auth-${roleId}`, email: `${roleId}@x.test` };
  h.db.admin_users = [
    { id: `m-${roleId}`, email: `${roleId}@x.test`, role_id: roleId, is_active: true, auth_user_id: `auth-${roleId}` },
  ];
};

const req = (method: string, body?: unknown) =>
  new Request("https://x.test/api/shop/customers", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: "c1" }) };

const ADDRESS = { recipient: "Ana Tan", line1: "1 Road", city: "Singapore", postal_code: "123456", country: "SG" };

const WRITES: [string, () => Promise<Response>][] = [
  ["POST /api/shop/customers", () => list.POST(req("POST", { email: "new@x.test" }))],
  ["PATCH /api/shop/customers/[id]", () => one.PATCH(req("PATCH", { first_name: "Changed" }), ctx)],
  ["POST /api/shop/customers/[id]/addresses", () => addresses.POST(req("POST", ADDRESS), ctx)],
];

const READS: [string, () => Promise<Response>][] = [
  ["GET /api/shop/customers", () => list.GET(req("GET"))],
  ["GET /api/shop/customers/[id]", () => one.GET(req("GET"), ctx)],
  ["GET /api/shop/customers/[id]/addresses", () => addresses.GET(req("GET"), ctx)],
];

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [
      role("owner", [], true),
      role("crm-editor", ["customers", "customers-edit"]),
      role("crm-viewer", ["customers"]),
      role("orders-only", ["orders"]),
    ],
    admin_users: [],
    customers: [{ id: "c1", email: "ana@x.test", first_name: "Ana", last_name: "Tan", tags: [] }],
    customer_addresses: [],
  };
});

describe("a view-only role (customers, no customers-edit)", () => {
  beforeEach(() => signIn("crm-viewer"));

  it.each(READS)("reads %s", async (_name, call) => {
    expect((await call()).status).toBe(200);
  });

  it.each(WRITES)("is refused %s with a 403", async (_name, call) => {
    expect((await call()).status).toBe(403);
  });

  it("changes nothing", async () => {
    for (const [, call] of WRITES) await call();
    expect(h.db.customers).toEqual([{ id: "c1", email: "ana@x.test", first_name: "Ana", last_name: "Tan", tags: [] }]);
    expect(h.db.customer_addresses).toEqual([]);
  });
});

describe.each(["crm-editor", "owner"])("a role that can change Customers (%s)", (roleId) => {
  beforeEach(() => signIn(roleId));

  it.each(WRITES)("writes %s", async (_name, call) => {
    expect((await call()).status).toBe(200);
  });

  it("changes the Customer through the PATCH", async () => {
    await one.PATCH(req("PATCH", { first_name: "Changed" }), ctx);
    expect(h.db.customers[0].first_name).toBe("Changed");
  });
});

describe("a role without customers", () => {
  beforeEach(() => signIn("orders-only"));

  it.each([...READS, ...WRITES])("is refused %s", async (_name, call) => {
    expect((await call()).status).toBe(403);
  });
});

describe("POST /api/shop/customers: Staff add a Customer", () => {
  beforeEach(() => signIn("crm-editor"));

  const post = (body: unknown) => list.POST(req("POST", body));

  it("saves the email lower-cased and the mobile normalised, and says it is new", async () => {
    const res = await post({ email: "  Bo.Lim@X.test ", first_name: "Bo", last_name: "Lim", phone: "9123 4567" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.created).toBe(true);
    expect(json.row).toMatchObject({ email: "bo.lim@x.test", first_name: "Bo", last_name: "Lim", phone: "+6591234567" });
    expect(h.db.customers).toHaveLength(2);
    expect(h.db.admin_audit_log?.at(-1)).toMatchObject({ action: "customer.create", entity_id: json.row.id });
  });

  it("returns the Customer who already has that email, whatever its capitals, and creates nobody", async () => {
    const res = await post({ email: "ANA@x.test", first_name: "Someone", last_name: "Else" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ created: false, row: { id: "c1", first_name: "Ana" } });
    expect(h.db.customers).toEqual([{ id: "c1", email: "ana@x.test", first_name: "Ana", last_name: "Tan", tags: [] }]);
    expect(h.db.admin_audit_log ?? []).toEqual([]);
  });

  it.each([
    ["a mobile that is not one", { email: "bo@x.test", phone: "12" }, "phone"],
    ["no email", { first_name: "Bo" }, "email"],
    ["an email that is not one", { email: "bo-at-x" }, "email"],
  ])("refuses %s, names the field and saves nothing", async (_name, body, field) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.field).toBe(field);
    expect(typeof json.error).toBe("string");
    expect(h.db.customers).toHaveLength(1);
  });
});
