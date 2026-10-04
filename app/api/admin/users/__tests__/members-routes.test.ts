import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Members API on Users & permissions (slice 04): every refusal the role policy
 * makes reaches the caller as a status and a readable sentence, and every
 * change is written to the Audit Log with before/after.
 */

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

const { PATCH } = await import("../[id]/route");
const { GET, POST } = await import("../route");

const R = {
  owner: "00000000-0000-4000-8000-0000000000a1",
  admin: "00000000-0000-4000-8000-0000000000a2",
  people: "00000000-0000-4000-8000-0000000000a3",
  orders: "00000000-0000-4000-8000-0000000000a4",
  media: "00000000-0000-4000-8000-0000000000a5",
};

const role = (id: string, key: string, permissions: string[], system = false) => ({
  id,
  key,
  name: key[0].toUpperCase() + key.slice(1),
  description: null,
  is_system: system,
  grants_all: system,
  permissions,
});

const member = (id: string, email: string, roleId: string, over: Record<string, unknown> = {}) => ({
  id,
  email,
  role_id: roleId,
  is_active: true,
  auth_user_id: `auth-${id}`,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

function signIn(id: string) {
  const row = h.db.admin_users.find((m) => m.id === id)!;
  h.identity = { id: row.auth_user_id as string, email: row.email as string };
}

const patch = (id: string, body: unknown) =>
  PATCH(
    new Request(`https://x.test/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

const invite = (body: unknown) =>
  POST(
    new Request("https://x.test/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [
      role(R.owner, "owner", [], true),
      role(R.admin, "admin", [], true),
      role(R.people, "people", ["users", "orders", "results"]),
      role(R.orders, "orders", ["orders"]),
      role(R.media, "media", ["media", "page-builder"]),
    ],
    admin_users: [
      member("owner1", "owner@x.test", R.owner),
      member("admin1", "admin@x.test", R.admin),
      member("people1", "people@x.test", R.people),
      member("orders1", "orders@x.test", R.orders),
      member("media1", "media@x.test", R.media),
    ],
    admin_audit_log: [],
  };
});

describe("PATCH /api/admin/users/[id]", () => {
  it("refuses a Member without the users permission", async () => {
    signIn("orders1");
    expect((await patch("media1", { is_active: false })).status).toBe(403);
  });

  it("refuses changing yourself with 400", async () => {
    signIn("owner1");
    const res = await patch("owner1", { is_active: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("You can't change your own role or deactivate yourself.");
  });

  it("an Owner may deactivate another Owner while an active Owner remains; an Admin may not", async () => {
    h.db.admin_users.push(member("owner2", "owner2@x.test", R.owner));
    signIn("admin1");
    const refused = await patch("owner2", { is_active: false });
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toBe("Only an Owner can change an Owner.");
    signIn("owner1");
    expect((await patch("owner2", { is_active: false })).status).toBe(200);
    // The last-active-Owner rule itself is covered in role-policy.test.ts: through the
    // API the actor is always an active Owner too, so it is reached only with stale rows.
  });

  it("refuses an Admin granting Owner, with a readable reason", async () => {
    signIn("admin1");
    const res = await patch("orders1", { role_id: R.owner });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Only an Owner can grant Owner.");
  });

  it("refuses a narrower manager assigning a role beyond their pages", async () => {
    signIn("people1");
    const res = await patch("orders1", { role_id: R.media });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("pages you don't have: Media, Page Builder");
    expect((await patch("media1", { is_active: false })).status).toBe(403);
  });

  it("allows a permitted change and audits member.update with before/after", async () => {
    signIn("people1");
    const res = await patch("orders1", { role_id: R.people });
    expect(res.status).toBe(200);
    expect((await res.json()).member).toMatchObject({ id: "orders1", roleId: R.people, status: "active" });
    expect(h.db.admin_audit_log).toHaveLength(1);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "member.update",
      entity_type: "member",
      entity_id: "orders1",
      actor_email: "people@x.test",
      before: { email: "orders@x.test", role: "Orders", status: "active" },
      after: { email: "orders@x.test", role: "People", status: "active" },
    });
  });

  it("deactivating and reactivating report the status", async () => {
    signIn("owner1");
    expect((await (await patch("media1", { is_active: false })).json()).member.status).toBe("deactivated");
    expect((await (await patch("media1", { is_active: true })).json()).member.status).toBe("active");
  });

  it("404s an unknown Member and 400s an empty change", async () => {
    signIn("owner1");
    expect((await patch("nobody", { is_active: false })).status).toBe(404);
    expect((await patch("media1", {})).status).toBe(400);
  });
});

describe("/api/admin/users", () => {
  it("GET lists Members with status and roles with member counts", async () => {
    h.db.admin_users.push(member("inv1", "new@x.test", R.orders, { auth_user_id: null }));
    signIn("owner1");
    const body = await (await GET()).json();
    expect(body.members.find((m: { id: string }) => m.id === "inv1").status).toBe("invited");
    expect(body.roles.map((r: { key: string }) => r.key).slice(0, 2)).toEqual(["owner", "admin"]);
    expect(body.roles.find((r: { key: string }) => r.key === "orders").memberCount).toBe(2);
  });

  it("POST invites with an assignable role and audits member.invite", async () => {
    signIn("people1");
    const res = await invite({ email: "New@X.test", role_id: R.orders });
    expect(res.status).toBe(201);
    expect(h.db.admin_users.at(-1)).toMatchObject({ email: "new@x.test", role_id: R.orders });
    expect(h.db.admin_audit_log[0]).toMatchObject({ action: "member.invite", entity_type: "member" });
  });

  it("POST refuses a role the inviter may not assign", async () => {
    signIn("people1");
    expect((await invite({ email: "n@x.test", role_id: R.admin })).status).toBe(403);
    signIn("admin1");
    expect((await invite({ email: "n@x.test", role_id: R.owner })).status).toBe(403);
  });
});
