import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/** Roles API (slice 06): each endpoint's allow and refuse cases, and the audit trail. */

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

const { GET, POST } = await import("../route");
const { PATCH, DELETE } = await import("../[id]/route");

const role = (id: string, key: string, permissions: string[], system = false) => ({
  id,
  key,
  name: key[0].toUpperCase() + key.slice(1),
  description: null,
  is_system: system,
  grants_all: system,
  permissions,
});

const member = (id: string, roleId: string) => ({
  id,
  email: `${id}@x.test`,
  role_id: roleId,
  is_active: true,
  auth_user_id: `auth-${id}`,
  created_at: "2026-10-01T00:00:00Z",
});

const signIn = (id: string) => (h.identity = { id: `auth-${id}`, email: `${id}@x.test` });

const json = (method: string, body?: unknown) =>
  new Request("https://x.test/api/admin/roles", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [
      role("r-owner", "owner", [], true),
      role("r-admin", "admin", [], true),
      role("r-people", "people", ["users", "orders", "faq"]),
      role("r-orders", "orders", ["orders"]),
      role("r-empty", "empty", []),
    ],
    admin_users: [member("owner1", "r-owner"), member("people1", "r-people"), member("orders1", "r-orders")],
    admin_audit_log: [],
  };
});

describe("GET /api/admin/roles", () => {
  it("lists roles for users holders, refuses others", async () => {
    signIn("owner1");
    const body = await (await GET()).json();
    expect(body.roles.find((r: { key: string }) => r.key === "orders").memberCount).toBe(1);
    signIn("orders1");
    expect((await GET()).status).toBe(403);
  });
});

describe("POST /api/admin/roles", () => {
  it("creates a role with requires applied server-side, and audits it", async () => {
    signIn("owner1");
    const res = await POST(json("POST", { name: "Landing editors", permissions: ["page-builder", "faq"] }));
    expect(res.status).toBe(201);
    const { role: created } = await res.json();
    expect(created).toMatchObject({ key: "landing-editors", permissions: ["faq", "media", "page-builder"] });
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "role.create",
      entity_type: "role",
      after: { name: "Landing editors", permissions: ["faq", "media", "page-builder"] },
    });
  });

  it("refuses unknown keys, a taken name, and pages beyond a narrower creator", async () => {
    signIn("owner1");
    expect((await POST(json("POST", { name: "X", permissions: ["nope"] }))).status).toBe(400);
    expect((await POST(json("POST", { name: "orders", permissions: [] }))).status).toBe(409);
    signIn("people1");
    expect((await POST(json("POST", { name: "Y", permissions: ["orders"] }))).status).toBe(201);
    expect((await POST(json("POST", { name: "Z", permissions: ["media"] }))).status).toBe(403);
  });
});

describe("PATCH /api/admin/roles/[id]", () => {
  it("edits a custom role's pages with before/after in the audit", async () => {
    signIn("owner1");
    const res = await PATCH(json("PATCH", { permissions: ["orders", "returns"] }), ctx("r-orders"));
    expect(res.status).toBe(200);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "role.update",
      before: { permissions: ["orders"] },
      after: { permissions: ["orders", "returns"] },
    });
  });

  it("refuses built-in roles, beyond-own edits, and an unknown role", async () => {
    signIn("owner1");
    expect((await PATCH(json("PATCH", { permissions: [] }), ctx("r-admin"))).status).toBe(403);
    expect((await PATCH(json("PATCH", { name: "x" }), ctx("nope"))).status).toBe(404);
    signIn("people1");
    expect((await PATCH(json("PATCH", { permissions: ["orders", "faq"] }), ctx("r-orders"))).status).toBe(200);
    expect((await PATCH(json("PATCH", { permissions: ["orders", "media"] }), ctx("r-orders"))).status).toBe(403);
  });
});

describe("DELETE /api/admin/roles/[id]", () => {
  it("refuses a role with Members (409 with the count) and a built-in role", async () => {
    signIn("owner1");
    const res = await DELETE(json("DELETE"), ctx("r-orders"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("1 Member holds Orders. Move them to another role first.");
    expect((await DELETE(json("DELETE"), ctx("r-admin"))).status).toBe(403);
  });

  it("deletes an unheld role and audits it", async () => {
    signIn("owner1");
    expect((await DELETE(json("DELETE"), ctx("r-empty"))).status).toBe(200);
    expect(h.db.admin_roles.some((r) => r.id === "r-empty")).toBe(false);
    expect(h.db.admin_audit_log[0]).toMatchObject({ action: "role.delete", before: { name: "Empty" } });
  });
});
