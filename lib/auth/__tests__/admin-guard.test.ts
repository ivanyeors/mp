import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guard contract tests for the single RBAC authorization model (#39 cutover).
 *
 * After retiring the shared-OTP login, `requireAdmin` / `requireAdminContext` /
 * `assertAdmin` are the ONLY way to authorize an admin action. These tests
 * assert the externally observable decision — not the implementation — by
 * driving the two inputs the model depends on: the Supabase auth user and the
 * matched `admin_users` row. There is no secret, cookie, or env value that can
 * yield authorization here; absent a valid staff session, every guard denies.
 */

const getAuthUserMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => getAuthUserMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    Object.assign(builder, {
      from: chain,
      select: chain,
      eq: chain,
      ilike: chain,
      update: chain,
      insert: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => maybeSingleMock(),
    });
    return builder;
  },
}));

import { requireAdmin, assertAdmin, getAdminContext } from "@/lib/auth/admin";

type AdminRow = { id: string; role: string; is_active: boolean; auth_user_id: string };

function signedInAs(row: AdminRow | null, email = "person@example.com") {
  getAuthUserMock.mockResolvedValue({ id: row?.auth_user_id ?? "auth-1", email });
  maybeSingleMock.mockResolvedValue({ data: row, error: null });
}

function signedOut() {
  getAuthUserMock.mockResolvedValue(null);
  maybeSingleMock.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  // The bootstrap allowlist must not be a backdoor in these tests.
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
});

describe("requireAdmin (route guard)", () => {
  it("denies with 401 when there is no staff session", async () => {
    signedOut();
    const denied = await requireAdmin("orders");
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(401);
  });

  it("denies with 403 when the role lacks the permission", async () => {
    signedInAs({ id: "1", role: "manager", is_active: true, auth_user_id: "auth-1" });
    const denied = await requireAdmin("staff");
    expect(denied).not.toBeNull();
    expect(denied?.status).toBe(403);
  });

  it("allows (returns null) when the role grants the permission", async () => {
    signedInAs({ id: "1", role: "manager", is_active: true, auth_user_id: "auth-1" });
    const denied = await requireAdmin("orders");
    expect(denied).toBeNull();
  });

  it("denies a deactivated staff member even with a privileged role", async () => {
    signedInAs({ id: "1", role: "owner", is_active: false, auth_user_id: "auth-1" });
    const denied = await requireAdmin("orders");
    expect(denied?.status).toBe(401);
  });
});

describe("assertAdmin (server-action guard)", () => {
  it("throws Unauthorized without a staff session", async () => {
    signedOut();
    await expect(assertAdmin("orders")).rejects.toThrow("Unauthorized");
  });

  it("throws Forbidden when the role lacks the permission", async () => {
    signedInAs({ id: "1", role: "viewer", is_active: true, auth_user_id: "auth-1" });
    await expect(assertAdmin("products")).rejects.toThrow("Forbidden");
  });

  it("returns the admin context on success", async () => {
    signedInAs({ id: "1", role: "owner", is_active: true, auth_user_id: "auth-1" });
    const ctx = await assertAdmin("audit-log");
    expect(ctx.role).toBe("owner");
    expect(ctx.email).toBe("person@example.com");
  });
});

describe("getAdminContext (no non-RBAC path)", () => {
  it("returns null for an authenticated user without an admin_users row", async () => {
    // A valid Supabase session alone — no staff record, not allowlisted — is
    // never sufficient. This is the failure mode the OTP path used to bypass.
    signedInAs(null, "stranger@example.com");
    expect(await getAdminContext()).toBeNull();
  });
});
