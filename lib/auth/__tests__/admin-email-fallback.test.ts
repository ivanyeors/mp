import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * getAdminContext's email fallback (#169). An `admin_users` row found by email
 * belongs to whoever it is bound to: a second auth user with the same email
 * gets nothing, and a `_`/`%` in the signed-in email is literal, so it can't
 * adopt another Staff member's unbound row either.
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

const { getAdminContext } = await import("@/lib/auth/admin");

const staffRow = (over: Record<string, unknown> = {}) => ({
  id: "staff-1",
  email: "b@x.com",
  role_id: "r-owner",
  is_active: true,
  auth_user_id: null as string | null,
  ...over,
});

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_users: [],
    admin_roles: [{ id: "r-owner", key: "owner", name: "Owner", grants_all: true, permissions: [] }],
  };
  h.identity = null;
});

describe("getAdminContext email fallback", () => {
  it("returns null for user B when B's email row is already bound to user A", async () => {
    h.db.admin_users = [staffRow({ auth_user_id: "auth-A" })];
    h.identity = { id: "auth-B", email: "B@x.com" };

    expect(await getAdminContext()).toBeNull();
    expect(h.db.admin_users[0].auth_user_id).toBe("auth-A");
  });

  it("binds an unbound row on first sign-in and grants its role", async () => {
    h.db.admin_users = [staffRow()];
    h.identity = { id: "auth-B", email: "b@x.com" };

    expect(await getAdminContext()).toMatchObject({ userId: "auth-B", roleKey: "owner", isBootstrap: false });
    expect(h.db.admin_users[0].auth_user_id).toBe("auth-B");
  });

  it("still resolves the bound user by auth id", async () => {
    h.db.admin_users = [staffRow({ auth_user_id: "auth-A" })];
    h.identity = { id: "auth-A", email: "b@x.com" };

    expect(await getAdminContext()).toMatchObject({ userId: "auth-A", roleKey: "owner" });
  });

  it("does not let `_` in the signed-in email adopt another unbound row", async () => {
    h.db.admin_users = [staffRow({ email: "ab@x.com" })];
    h.identity = { id: "auth-evil", email: "a_@x.com" };

    expect(await getAdminContext()).toBeNull();
    expect(h.db.admin_users[0].auth_user_id).toBeNull();
  });

  it("does not let `*` (PostgREST's other wildcard) adopt another unbound row", async () => {
    h.db.admin_users = [staffRow({ email: "alice@mpillow.com" })];
    h.identity = { id: "auth-evil", email: "*@mpillow.com" };

    expect(await getAdminContext()).toBeNull();
    expect(h.db.admin_users[0].auth_user_id).toBeNull();
  });

  it("leaves the bootstrap allowlist path unchanged", async () => {
    h.identity = { id: "auth-sg", email: "sg@mpillow.com" };

    expect(await getAdminContext()).toMatchObject({ roleKey: "owner", isBootstrap: true });
    expect(h.db.admin_users).toHaveLength(1);
    expect(h.db.admin_users[0]).toMatchObject({ email: "sg@mpillow.com", role_id: "r-owner" });
    // …with a first Staff profile named from the email.
    expect(h.db.mp_staff).toEqual([expect.objectContaining({ name: "Sg", admin_user_id: h.db.admin_users[0].id })]);
  });
});
