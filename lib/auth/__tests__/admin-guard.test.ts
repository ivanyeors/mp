import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
}));

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const { requireAdmin, requireAnyAdmin, requireAdminPage, assertAdmin, getAdminContext } = await import("@/lib/auth/admin");
const { ADMIN_PERMISSIONS, ROLE_PERMISSIONS } = await import("@/lib/auth/permissions");

const role = (id: string, key: string, permissions: string[], grantsAll = false) => ({
  id,
  key,
  name: key[0].toUpperCase() + key.slice(1),
  is_system: grantsAll,
  grants_all: grantsAll,
  permissions,
});

function seedRoles() {
  return [
    role("r-owner", "owner", [], true),
    role("r-admin", "admin", [], true),
    role("r-manager", "manager", [...ROLE_PERMISSIONS.manager]),
    role("r-fulfilment", "fulfilment", [...ROLE_PERMISSIONS.staff]),
    role("r-viewer", "viewer", [...ROLE_PERMISSIONS.viewer]),
  ];
}

function signedInAs(roleId: string, over: Record<string, unknown> = {}) {
  h.identity = { id: "auth-1", email: "person@example.com" };
  h.db.admin_users = [
    { id: "m-1", email: "person@example.com", role_id: roleId, is_active: true, auth_user_id: "auth-1", ...over },
  ];
}

function signedOut() {
  h.identity = null;
}

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = { admin_users: [], admin_roles: seedRoles() };
  h.identity = null;
});

describe("requireAdmin (route guard)", () => {
  it("denies with 401 when there is no staff session", async () => {
    signedOut();
    const denied = await requireAdmin("orders");
    expect(denied?.status).toBe(401);
  });

  it("denies with 403 when the role lacks the permission", async () => {
    signedInAs("r-manager");
    const denied = await requireAdmin("users");
    expect(denied?.status).toBe(403);
  });

  it("allows (returns null) when the role grants the permission", async () => {
    signedInAs("r-manager");
    expect(await requireAdmin("orders")).toBeNull();
  });

  it("denies a deactivated Member even with a privileged role", async () => {
    signedInAs("r-owner", { is_active: false });
    const denied = await requireAdmin("orders");
    expect(denied?.status).toBe(401);
  });

  it("requireAnyAdmin allows when one of the keys is held", async () => {
    signedInAs("r-viewer");
    expect(await requireAnyAdmin(["products", "orders"])).toBeNull();
    expect((await requireAnyAdmin(["products", "inventory"]))?.status).toBe(403);
  });
});

describe("assertAdmin (server-action guard)", () => {
  it("throws Unauthorized without a staff session", async () => {
    signedOut();
    await expect(assertAdmin("orders")).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when the role lacks the permission", async () => {
    signedInAs("r-viewer");
    await expect(assertAdmin("products")).rejects.toThrow("Forbidden");
  });

  it("returns the admin context on success", async () => {
    signedInAs("r-owner");
    const ctx = await assertAdmin("audit-log");
    expect(ctx).toMatchObject({ memberId: "m-1", roleKey: "owner", isOwner: true, grantsAll: true });
    expect(ctx.email).toBe("person@example.com");
  });
});

describe("permissions come from the role row (ADR 0023)", () => {
  it("a grants_all role holds every catalog key, including keys no stored array names", async () => {
    signedInAs("r-admin");
    const ctx = await getAdminContext();
    expect(ctx?.isOwner).toBe(false);
    expect([...ctx!.permissions].sort()).toEqual([...ADMIN_PERMISSIONS].sort());
    expect(ctx!.permissions.has("telegram.shop-review-moderate")).toBe(true);
  });

  it("ignores a stored key the catalog does not have, and refuses a key it lacks", async () => {
    h.db.admin_roles.push(role("r-narrow", "narrow", ["faq", "retired-page"]));
    signedInAs("r-narrow");
    const ctx = await getAdminContext();
    expect([...ctx!.permissions]).toEqual(["faq"]);
    expect(await requireAdmin("faq")).toBeNull();
    expect((await requireAdmin("forms"))?.status).toBe(403);
  });

  it("a role edit applies on the next request — nothing is cached between calls", async () => {
    h.db.admin_roles.push(role("r-narrow", "narrow", ["faq"]));
    signedInAs("r-narrow");
    expect((await requireAdmin("orders"))?.status).toBe(403);
    h.db.admin_roles.find((r) => r.id === "r-narrow")!.permissions = ["faq", "orders"];
    expect(await requireAdmin("orders")).toBeNull();
  });

  it("a Member whose role row cannot be read gets nothing", async () => {
    signedInAs("r-missing");
    expect(await getAdminContext()).toBeNull();
  });
});

describe("getAdminContext (no non-RBAC path)", () => {
  it("returns null for an authenticated user without an admin_users row", async () => {
    h.identity = { id: "auth-x", email: "stranger@example.com" };
    expect(await getAdminContext()).toBeNull();
  });
});

describe("requireAdminPage (page guard)", () => {
  it("sends a Member without the page to the Admin Panel home naming the page", async () => {
    signedInAs("r-viewer");
    await expect(requireAdminPage("faq", "en-US")).rejects.toThrow("REDIRECT /en-US/settings?denied=faq");
  });

  it("sends a signed-out visitor to Sign in, with no denied key", async () => {
    signedOut();
    await expect(requireAdminPage("faq", "en-US")).rejects.toThrow(
      `REDIRECT /en-US/account/login?next=${encodeURIComponent("/en-US/settings")}`,
    );
  });

  it("returns the context when the role has the page", async () => {
    signedInAs("r-viewer");
    expect((await requireAdminPage("orders", "en-US")).roleKey).toBe("viewer");
  });
});
