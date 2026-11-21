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

const { GET, POST } = await import("../route");
const { PATCH } = await import("../[id]/route");
const { isPickableStaffProfile } = await import("@/lib/staff/admin");

const STUDIO = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";

const req = (url: string, method: string, body?: unknown) =>
  new Request(`https://x.test${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const patch = (id: string, body: unknown) => PATCH(req(`/api/staff/${id}`, "PATCH", body), { params: Promise.resolve({ id }) });
const signIn = (id: string) => {
  const m = h.db.admin_users.find((r) => r.id === id)!;
  h.identity = { id: m.auth_user_id as string, email: m.email as string };
};

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [
      { id: "r-owner", key: "owner", name: "Owner", grants_all: true, permissions: [] },
      { id: "r-results", key: "results", name: "Results", grants_all: false, permissions: ["results"] },
    ],
    admin_users: [
      { id: STUDIO, email: "studio@x.test", role_id: "r-owner", is_active: true, auth_user_id: "auth-s" },
      { id: OTHER, email: "other@x.test", role_id: "r-results", is_active: true, auth_user_id: "auth-o" },
    ],
    mp_staff: [
      { id: "p-jess", name: "Jess", admin_user_id: STUDIO, archived_at: null },
      { id: "p-old", name: "Old", admin_user_id: STUDIO, archived_at: "2026-09-01T00:00:00Z" },
    ],
    admin_audit_log: [],
  };
});

describe("GET /api/staff", () => {
  it("lists live profiles with their login for results or users holders", async () => {
    signIn(STUDIO);
    const body = await (await GET(req("/api/staff", "GET"))).json();
    expect(body.rows).toEqual([expect.objectContaining({ id: "p-jess", memberEmail: "studio@x.test", archivedAt: null })]);
    const all = await (await GET(req("/api/staff?includeArchived=1", "GET"))).json();
    expect(all.rows.map((r: { id: string }) => r.id).sort()).toEqual(["p-jess", "p-old"]);
  });
});

describe("writes need users", () => {
  it("refuses a results-only Member", async () => {
    signIn(OTHER);
    expect((await POST(req("/api/staff", "POST", { memberId: OTHER, name: "Zed" }))).status).toBe(403);
    expect((await patch("p-jess", { name: "J" })).status).toBe(403);
  });
});

describe("profile writes", () => {
  beforeEach(() => signIn(STUDIO));

  it("creates under a login and audits it", async () => {
    const res = await POST(req("/api/staff", "POST", { memberId: OTHER, name: "Jess" }));
    expect(res.status).toBe(201);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "staff_profile.create",
      entity_type: "staff_profile",
      after: { name: "Jess", member: "other@x.test", archived: false },
    });
  });

  it("refuses a name clash within one login (409), case-insensitively", async () => {
    const res = await POST(req("/api/staff", "POST", { memberId: STUDIO, name: "jess" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("This login already has a profile named jess.");
  });

  it("an archived name is free again", async () => {
    expect((await POST(req("/api/staff", "POST", { memberId: STUDIO, name: "Old" }))).status).toBe(201);
  });

  it("renames, moves, archives and restores, each audited with before/after", async () => {
    expect((await patch("p-jess", { name: "Jessica" })).status).toBe(200);
    expect((await patch("p-jess", { memberId: OTHER })).status).toBe(200);
    expect((await patch("p-jess", { archived: true })).status).toBe(200);
    expect((await patch("p-jess", { archived: false })).status).toBe(200);
    expect(h.db.admin_audit_log.map((r) => r.action)).toEqual([
      "staff_profile.rename",
      "staff_profile.move",
      "staff_profile.archive",
      "staff_profile.restore",
    ]);
    expect(h.db.admin_audit_log[1]).toMatchObject({
      before: { member: "studio@x.test" },
      after: { member: "other@x.test" },
    });
  });

  it("refuses moving into a clash, an unknown login, and a body with two changes", async () => {
    h.db.mp_staff.push({ id: "p-jess2", name: "Jess", admin_user_id: OTHER, archived_at: null });
    expect((await patch("p-jess", { memberId: OTHER })).status).toBe(409);
    expect((await patch("p-jess", { memberId: "00000000-0000-4000-8000-000000000999" })).status).toBe(404);
    expect((await patch("p-jess", { name: "A", archived: true })).status).toBe(400);
  });
});

describe("who may change a login's profiles (review finding)", () => {
  const PM = "00000000-0000-4000-8000-0000000000b3";
  beforeEach(() => {
    h.db.admin_roles.push({ id: "r-pm", key: "people", name: "People", grants_all: false, permissions: ["users", "results"] });
    h.db.admin_users.push({ id: PM, email: "pm@x.test", role_id: "r-pm", is_active: true, auth_user_id: "auth-pm" });
    h.db.mp_staff.push({ id: "p-other", name: "Olu", admin_user_id: OTHER, archived_at: null });
    signIn(PM);
  });

  it("a non-Owner cannot rename, archive or add profiles under an Owner's login", async () => {
    expect((await patch("p-jess", { name: "X" })).status).toBe(403);
    expect((await patch("p-jess", { archived: true })).status).toBe(403);
    expect((await POST(req("/api/staff", "POST", { memberId: STUDIO, name: "Zed" }))).status).toBe(403);
    expect(h.db.mp_staff.find((p) => p.id === "p-jess")).toMatchObject({ name: "Jess", archived_at: null });
  });

  it("…nor move a profile into an Owner's login", async () => {
    expect((await patch("p-other", { memberId: STUDIO })).status).toBe(403);
  });

  it("may manage a login whose role is within their own pages", async () => {
    expect((await patch("p-other", { name: "Olu A." })).status).toBe(200);
    expect((await POST(req("/api/staff", "POST", { memberId: OTHER, name: "Bea" }))).status).toBe(201);
  });

  it("cannot move a profile whose Telegram link can do more than they can", async () => {
    const THIRD = "00000000-0000-4000-8000-0000000000b4";
    h.db.admin_users.push({ id: THIRD, email: "third@x.test", role_id: "r-results", is_active: true, auth_user_id: "a3" });
    h.db.telegram_operators = [{ id: "l1", staff_profile_id: "p-other", actions: ["telegram.google-review-reply"] }];
    const res = await patch("p-other", { memberId: THIRD });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Reply to Google reviews");
    h.db.telegram_operators = [];
    expect((await patch("p-other", { memberId: THIRD })).status).toBe(200);
  });
});

describe("moving a profile to another login", () => {
  beforeEach(() => signIn(STUDIO));

  it("unbinds its Telegram account and voids a pending code, keeping the link's actions", async () => {
    h.db.telegram_operators = [
      {
        id: "l1",
        staff_profile_id: "p-jess",
        actions: ["telegram.shop-review-moderate"],
        telegram_user_id: 999,
        telegram_username: "exstaff",
        linked_at: "2026-09-01T00:00:00Z",
        link_code_hash: "pending",
        link_code_expires_at: "2999-01-01T00:00:00Z",
      },
    ];
    expect((await patch("p-jess", { memberId: OTHER })).status).toBe(200);
    expect(h.db.telegram_operators[0]).toMatchObject({
      telegram_user_id: null,
      telegram_username: null,
      linked_at: null,
      link_code_hash: null,
      actions: ["telegram.shop-review-moderate"],
    });
    expect(h.db.admin_audit_log.at(-1)).toMatchObject({
      action: "staff_profile.move",
      after: expect.objectContaining({ telegramUnlinked: true }),
    });
  });
});

describe("login emails", () => {
  it("are only served to users holders", async () => {
    signIn(OTHER);
    const body = await (await GET(req("/api/staff", "GET"))).json();
    expect(body.rows[0]).toMatchObject({ id: "p-jess", memberId: STUDIO, memberEmail: null });
    signIn(STUDIO);
    expect((await (await GET(req("/api/staff", "GET"))).json()).rows[0].memberEmail).toBe("studio@x.test");
  });
});

describe("measured by", () => {
  it("an archived or missing profile cannot be newly picked", async () => {
    expect(await isPickableStaffProfile("p-jess")).toBe(true);
    expect(await isPickableStaffProfile("p-old")).toBe(false);
    expect(await isPickableStaffProfile("nope")).toBe(false);
  });
});
