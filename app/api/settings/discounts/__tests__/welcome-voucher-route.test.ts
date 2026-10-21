import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Discounts → Welcome-back voucher (migration slice 06): the owner's place to
 * set decision 2. Seeing and changing the terms need `discounts`. Turning
 * issuing on needs complete terms. What is stored is exactly what
 * `claim_migrated_customer` reads, and every change is audited. Real
 * permission checks, through the shared fake admin.
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
  return {
    supabaseAdmin: () => {
      const fake = fakeSupabaseAdmin(h.db);
      return {
        from: (table: string) => {
          const q = fake.from(table) as ReturnType<typeof fake.from> & { upsert?: unknown };
          // The shared fake has no upsert; site_settings is keyed by `key`.
          q.upsert = async (rows: Record<string, unknown>[]) => {
            const stored = (h.db[table] ??= []);
            for (const row of rows) {
              const at = stored.findIndex((r) => r.key === row.key);
              if (at >= 0) stored[at] = { ...stored[at], ...row };
              else stored.push({ ...row });
            }
            return { error: null };
          };
          return q;
        },
      };
    },
  };
});
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn() }));

const route = await import("../welcome-voucher/route");

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

const put = (body: unknown) =>
  route.PUT(
    new Request("https://x.test/api/settings/discounts/welcome-voucher", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const stored = () =>
  Object.fromEntries((h.db.site_settings ?? []).filter((r) => String(r.key).startsWith("welcome_voucher_")).map((r) => [r.key, r.value]));

const TERMS = {
  enabled: true,
  type: "fixed_amount",
  value: 20,
  minOrder: 60,
  validDays: 60,
  issueUntil: "2099-12-31",
};

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [role("owner", [], true), role("marketing", ["discounts"]), role("crm", ["customers", "customers-edit"])],
    admin_users: [],
    // The slice 05 seed.
    site_settings: [
      { key: "welcome_voucher_enabled", value: "false" },
      { key: "welcome_voucher_valid_days", value: "60" },
    ],
    admin_audit_log: [],
  };
});

describe("GET", () => {
  it("reads the seeded terms as off, and says a Claim issues nothing", async () => {
    signIn("marketing");
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      terms: { enabled: false, type: null, value: null, minOrder: null, validDays: 60, issueUntil: null },
      malformed: [],
      issuing: { issuing: false, reason: "off" },
    });
  });

  it("refuses a role without discounts, even one that holds customers-edit", async () => {
    signIn("crm");
    expect((await route.GET()).status).toBe(403);
  });
});

describe("PUT", () => {
  it("stores the terms as the SQL reads them, says a Claim now issues, and audits the change", async () => {
    signIn("marketing");
    const res = await put(TERMS);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, issuing: { issuing: true, until: "2099-12-31" } });
    expect(stored()).toEqual({
      welcome_voucher_enabled: "true",
      welcome_voucher_type: "fixed_amount",
      welcome_voucher_value: "20",
      welcome_voucher_min_order: "60",
      welcome_voucher_valid_days: "60",
      welcome_voucher_issue_until: "2099-12-31",
    });
    const audit = (h.db.admin_audit_log ?? []).find((r) => r.action === "welcome_voucher_terms.update");
    expect(audit).toBeTruthy();
  });

  it("refuses to turn issuing on with incomplete terms, and changes nothing", async () => {
    signIn("owner");
    for (const body of [
      { ...TERMS, type: null },
      { ...TERMS, value: null },
      { ...TERMS, issueUntil: null },
    ]) {
      const res = await put(body);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/before turning issuing on/);
    }
    expect(stored().welcome_voucher_enabled).toBe("false");
  });

  it("drops a value sent with a free-shipping voucher", async () => {
    signIn("owner");
    const res = await put({ ...TERMS, type: "free_shipping", value: 20 });
    expect((await res.json()).terms).toMatchObject({ type: "free_shipping", value: null });
    expect(stored().welcome_voucher_value).toBe("");
  });

  it("refuses a role without discounts, and changes nothing", async () => {
    signIn("crm");
    expect((await put(TERMS)).status).toBe(403);
    expect(stored().welcome_voucher_enabled).toBe("false");
    expect(h.db.admin_audit_log).toEqual([]);
  });
});
