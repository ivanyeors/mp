import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * "Working as" (slice 10): a cookie is attribution only. It is honoured only
 * for one of the signed-in login's live profiles, and never changes what the
 * login can do.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
  cookie: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "mp_working_as" && h.cookie ? { value: h.cookie } : undefined) }),
}));
vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { getWorkingAs, validWorkingAs } = await import("@/lib/staff/working-as");
const { getAdminContext } = await import("@/lib/auth/admin");
const { recordAdminAction } = await import("@/lib/auth/audit");
const { POST } = await import("@/app/api/admin/working-as/route");

const JESS = "11111111-1111-4111-8111-111111111111";
const KAI = "22222222-2222-4222-8222-222222222222";
const OLD = "33333333-3333-4333-8333-333333333333";
const OTHERS = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.cookie = undefined;
  h.identity = { id: "auth-studio", email: "studio@x.test" };
  h.db = {
    admin_roles: [{ id: "r-f", key: "fulfilment", name: "Fulfilment", grants_all: false, permissions: ["orders", "results"] }],
    admin_users: [
      { id: "m-studio", email: "studio@x.test", role_id: "r-f", is_active: true, auth_user_id: "auth-studio" },
      { id: "m-other", email: "other@x.test", role_id: "r-f", is_active: true, auth_user_id: "auth-other" },
    ],
    mp_staff: [
      { id: JESS, name: "Jess", admin_user_id: "m-studio", archived_at: null },
      { id: KAI, name: "Kai Lin", admin_user_id: "m-studio", archived_at: null },
      { id: OLD, name: "Old", admin_user_id: "m-studio", archived_at: "2026-01-01T00:00:00Z" },
      { id: OTHERS, name: "Sam", admin_user_id: "m-other", archived_at: null },
    ],
    admin_audit_log: [],
  };
});

describe("validWorkingAs", () => {
  it("accepts one of the login's live profiles", async () => {
    expect(await validWorkingAs("m-studio", JESS)).toEqual({ id: JESS, name: "Jess" });
  });

  it("ignores another login's profile, an archived one, and garbage", async () => {
    expect(await validWorkingAs("m-studio", OTHERS)).toBeNull();
    expect(await validWorkingAs("m-studio", OLD)).toBeNull();
    expect(await validWorkingAs("m-studio", "'; drop table")).toBeNull();
    expect(await validWorkingAs("m-studio", null)).toBeNull();
  });

  it("reads the cookie and re-validates it", async () => {
    h.cookie = OTHERS;
    expect(await getWorkingAs("m-studio")).toBeNull();
    h.cookie = KAI;
    expect(await getWorkingAs("m-studio")).toEqual({ id: KAI, name: "Kai Lin" });
  });
});

describe("attribution, never authorisation", () => {
  it("the admin context and its permissions are identical with or without the cookie", async () => {
    const without = await getAdminContext();
    h.cookie = JESS;
    const withCookie = await getAdminContext();
    expect(withCookie).toEqual(without);
    expect([...withCookie!.permissions].sort()).toEqual(["orders", "results"]);
  });

  it("audit entries name the working-as profile, and only a valid one", async () => {
    const actor = { userId: "auth-studio", email: "studio@x.test", memberId: "m-studio" };
    h.cookie = JESS;
    await recordAdminAction({ actor, action: "x.one", entityType: "x" });
    h.cookie = OTHERS;
    await recordAdminAction({ actor, action: "x.two", entityType: "x" });
    expect(h.db.admin_audit_log[0]).toMatchObject({ action: "x.one", actor_profile_id: JESS });
    expect(h.db.admin_audit_log[1]).not.toHaveProperty("actor_profile_id");
  });
});

describe("POST /api/admin/working-as", () => {
  const post = (profileId: string | null) =>
    POST(
      new Request("https://x.test/api/admin/working-as", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
      }),
    );

  it("sets an httpOnly cookie for the login's own profile", async () => {
    const res = await post(KAI);
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`mp_working_as=${KAI}`);
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("refuses another login's profile", async () => {
    expect((await post(OTHERS)).status).toBe(400);
  });

  it("refuses a visitor who is not signed in", async () => {
    h.identity = null;
    expect((await post(KAI)).status).toBe(401);
  });
});
