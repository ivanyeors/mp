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
  send: vi.fn(),
}));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: h.send }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { PATCH } = await import("../[id]/route");
const { GET, POST } = await import("../route");
const { DELETE } = await import("../[id]/route");
const { POST: RESEND } = await import("../[id]/resend-invite/route");

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
  h.send.mockReset().mockResolvedValue({ id: "e1" });
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
    mp_staff: [],
    mp_config_responses: [],
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

  it("POST invites: Invited row, first profile, email, audit", async () => {
    signIn("people1");
    const res = await invite({ email: "Kai.Lin@X.test", role_id: R.orders });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ emailSent: true, member: { email: "kai.lin@x.test", status: "invited" } });
    expect(h.db.admin_users.at(-1)).toMatchObject({ email: "kai.lin@x.test", role_id: R.orders, invited_by: "people1" });
    expect(h.db.admin_users.at(-1)!.invite_sent_at).toBeTruthy();
    expect(h.db.mp_staff).toEqual([expect.objectContaining({ name: "Kai Lin", admin_user_id: body.member.id })]);
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "kai.lin@x.test", subject: "You're invited to the Mpillow Admin Panel" }),
    );
    expect(h.send.mock.calls[0][0].text).toContain("people@x.test");
    expect(h.db.admin_audit_log.map((r) => r.action)).toEqual(["staff_profile.create", "member.invite"]);
  });

  it("POST uses the given first profile name", async () => {
    signIn("owner1");
    await invite({ email: "x@x.test", role_id: R.orders, profile_name: "Studio iPad" });
    expect(h.db.mp_staff[0]).toMatchObject({ name: "Studio iPad" });
  });

  it("POST keeps the invite when the email fails, and says so", async () => {
    h.send.mockRejectedValue(new Error("smtp down"));
    signIn("owner1");
    const res = await invite({ email: "x@x.test", role_id: R.orders });
    expect(res.status).toBe(201);
    expect((await res.json()).emailSent).toBe(false);
    expect(h.db.admin_users.at(-1)!.invite_sent_at ?? null).toBeNull();
  });

  it("POST refuses a duplicate email with 409 naming the existing state", async () => {
    signIn("owner1");
    const res = await invite({ email: "ORDERS@x.test", role_id: R.orders });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("orders@x.test is already a Member (Active).");
  });

  it("POST refuses a role the inviter may not assign", async () => {
    signIn("people1");
    expect((await invite({ email: "n@x.test", role_id: R.admin })).status).toBe(403);
    signIn("admin1");
    expect((await invite({ email: "n@x.test", role_id: R.owner })).status).toBe(403);
  });
});

describe("resend and revoke", () => {
  const call = (fn: typeof DELETE, id: string) =>
    fn(new Request(`https://x.test/api/admin/users/${id}`, { method: "POST" }), { params: Promise.resolve({ id }) });

  beforeEach(() => {
    h.db.admin_users.push(
      member("inv1", "new@x.test", R.orders, { auth_user_id: null, invite_sent_at: "2026-01-01T00:00:00Z" }),
    );
    h.db.mp_staff.push(
      { id: "p-new", name: "New", admin_user_id: "inv1", archived_at: null },
      { id: "p-used", name: "Used", admin_user_id: "inv1", archived_at: null },
    );
    h.db.mp_config_responses.push({ id: "res1", measured_by_staff_id: "p-used" });
  });

  it("resends, then refuses a second resend inside a minute (429)", async () => {
    signIn("owner1");
    const first = await call(RESEND, "inv1");
    expect(first.status).toBe(200);
    expect(h.send).toHaveBeenCalledOnce();
    expect((await call(RESEND, "inv1")).status).toBe(429);
    expect(h.db.admin_audit_log.map((r) => r.action)).toEqual(["member.invite_resend"]);
  });

  it("refuses resend and revoke for an Active Member", async () => {
    signIn("owner1");
    expect((await call(RESEND, "orders1")).status).toBe(409);
    expect((await call(DELETE, "orders1")).status).toBe(409);
  });

  it("revokes: deletes the Member and unused profiles, archives an attributed one to the revoker", async () => {
    signIn("owner1");
    expect((await call(DELETE, "inv1")).status).toBe(200);
    expect(h.db.admin_users.some((m) => m.id === "inv1")).toBe(false);
    expect(h.db.mp_staff.map((p) => p.id)).toEqual(["p-used"]);
    expect(h.db.mp_staff[0]).toMatchObject({ admin_user_id: "owner1" });
    expect(h.db.mp_staff[0].archived_at).toBeTruthy();
    expect(h.db.admin_audit_log.at(-1)).toMatchObject({
      action: "member.invite_revoke",
      before: { email: "new@x.test", status: "invited" },
      after: { archivedProfilesMovedToRevoker: ["Used"] },
    });
  });

  it("refuses a narrower manager revoking an invite for a broader role", async () => {
    h.db.admin_users.push(member("inv2", "big@x.test", R.media, { auth_user_id: null }));
    signIn("people1");
    expect((await call(DELETE, "inv2")).status).toBe(403);
  });
});
