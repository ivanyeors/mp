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

const { adminCanSeeCost } = await import("@/lib/auth/admin");
const { ROLE_PERMISSIONS } = await import("@/lib/auth/permissions");

const role = (id: string, key: string, permissions: string[], grantsAll = false) => ({
  id,
  key,
  name: key,
  is_system: grantsAll,
  grants_all: grantsAll,
  permissions,
});

function signedInAs(roleId: string, over: Record<string, unknown> = {}) {
  h.identity = { id: "auth-1", email: "person@example.com" };
  h.db.admin_users = [
    { id: "m-1", email: "person@example.com", role_id: roleId, is_active: true, auth_user_id: "auth-1", ...over },
  ];
}

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.identity = null;
  h.db = {
    admin_users: [],
    admin_roles: [
      role("r-owner", "owner", [], true),
      role("r-manager", "manager", [...ROLE_PERMISSIONS.manager]),
      role("r-fulfilment", "fulfilment", [...ROLE_PERMISSIONS.staff]),
      role("r-marketing", "marketing", ["products", "media", "page-builder", "blogs"]),
      role("r-costings-only", "costings-only", ["costings"]),
    ],
  };
});

describe("adminCanSeeCost", () => {
  it("is false when nobody is signed in", async () => {
    expect(await adminCanSeeCost()).toBe(false);
  });

  it("is false for a signed-in customer who is not staff", async () => {
    h.identity = { id: "auth-9", email: "shopper@example.com" };
    expect(await adminCanSeeCost()).toBe(false);
  });

  it("is true for a role holding costings", async () => {
    signedInAs("r-manager");
    expect(await adminCanSeeCost()).toBe(true);
    signedInAs("r-costings-only");
    expect(await adminCanSeeCost()).toBe(true);
  });

  it("is false for roles without costings, inventory or products ones included", async () => {
    signedInAs("r-fulfilment");
    expect(await adminCanSeeCost()).toBe(false);
    signedInAs("r-marketing");
    expect(await adminCanSeeCost()).toBe(false);
  });

  it("is true for a role that grants everything, though its list is empty", async () => {
    signedInAs("r-owner");
    expect(await adminCanSeeCost()).toBe(true);
  });

  it("is false for a deactivated member of a costings role", async () => {
    signedInAs("r-manager", { is_active: false });
    expect(await adminCanSeeCost()).toBe(false);
  });
});
