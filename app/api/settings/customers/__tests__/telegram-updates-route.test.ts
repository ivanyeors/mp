import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Customers → Settings → Telegram updates (CRM slice 14). Seeing the card needs
 * `customers`; changing it needs `customers-edit`; the online Result switch
 * also needs `results`. Every change is audited, and *Send test* posts only the
 * enabled types. Real permission checks, through the shared fake admin.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
  telegrams: [] as string[],
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
          q.upsert = async (row: Record<string, unknown>) => {
            const rows = (h.db[table] ??= []);
            const at = rows.findIndex((r) => r.key === row.key);
            if (at >= 0) rows[at] = { ...rows[at], ...row };
            else rows.push({ ...row });
            return { error: null };
          };
          return q;
        },
      };
    },
  };
});
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn() }));
vi.mock("@/lib/telegram/notify", () => ({
  sendTelegram: async (text: string) => {
    h.telegrams.push(text);
    return "sent";
  },
}));

const route = await import("../telegram-updates/route");
const testRoute = await import("../telegram-updates/test/route");

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
    new Request("https://x.test/api/settings/customers/telegram-updates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const sendTest = () =>
  testRoute.POST(new Request("https://x.test/api/settings/customers/telegram-updates/test", { method: "POST" }));

const stored = () => {
  const row = (h.db.site_settings ?? []).find((r) => r.key === "crm_telegram_updates");
  return row ? JSON.parse(String(row.value)) : null;
};
const audits = () => (h.db.admin_audit_log ?? []).map((r) => r.action);

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.telegrams = [];
  h.db = {
    admin_roles: [
      role("owner", [], true),
      role("crm-and-results", ["customers", "customers-edit", "results"]),
      role("crm-editor", ["customers", "customers-edit"]),
      role("crm-viewer", ["customers"]),
      role("orders-only", ["orders"]),
    ],
    admin_users: [],
    site_settings: [{ key: "results_sla_remind_telegram", value: "false" }],
    admin_audit_log: [],
  };
});

describe("GET: seeing the card needs customers", () => {
  it("returns the defaults, the held-Result reminder's state, and what this role may change", async () => {
    signIn("crm-viewer");
    const res = await route.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      settings: {
        online_result_held: { enabled: true },
        google_reviews_to_match: { enabled: true },
        new_sign_ups: { enabled: true },
        weekly_summary: { enabled: true, day: "mon" },
      },
      heldReminderTelegram: false,
      canEdit: false,
      canEditOnlineResult: false,
    });
  });

  it.each([
    ["crm-editor", true, false],
    ["crm-and-results", true, true],
    ["owner", true, true],
  ])("%s: canEdit %s, canEditOnlineResult %s", async (roleId, canEdit, canEditOnlineResult) => {
    signIn(roleId);
    expect(await (await route.GET()).json()).toMatchObject({ canEdit, canEditOnlineResult });
  });

  it("refuses a role without customers", async () => {
    signIn("orders-only");
    expect((await route.GET()).status).toBe(403);
  });
});

describe("PUT: changing it needs customers-edit", () => {
  it("refuses a view-only role, and changes nothing", async () => {
    signIn("crm-viewer");
    expect((await put({ new_sign_ups: { enabled: false } })).status).toBe(403);
    expect(stored()).toBeNull();
    expect(audits()).toEqual([]);
  });

  it("lets customers-edit change a CRM type and the weekly day, and audits each change", async () => {
    signIn("crm-editor");
    const res = await put({ new_sign_ups: { enabled: false } });
    expect(res.status).toBe(200);
    expect((await put({ weekly_summary: { day: "fri" } })).status).toBe(200);
    expect(stored()).toEqual({
      online_result_held: { enabled: true },
      google_reviews_to_match: { enabled: true },
      new_sign_ups: { enabled: false },
      weekly_summary: { enabled: true, day: "fri" },
    });
    expect(audits()).toEqual(["crm_telegram_updates.update", "crm_telegram_updates.update"]);
  });

  it("refuses the online Result switch with customers-edit alone", async () => {
    signIn("crm-editor");
    const res = await put({ online_result_held: { enabled: false } });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Results permission/);
    expect(stored()).toBeNull();
    // Sending today's value back is not a change, so it is not refused.
    expect((await put({ online_result_held: { enabled: true }, new_sign_ups: { enabled: false } })).status).toBe(200);
  });

  it.each(["crm-and-results", "owner"])("lets %s (customers-edit and results) change the online Result switch", async (roleId) => {
    signIn(roleId);
    expect((await put({ online_result_held: { enabled: false } })).status).toBe(200);
    expect(stored().online_result_held).toEqual({ enabled: false });
  });

  it("refuses an unknown type or weekday", async () => {
    signIn("owner");
    expect((await put({ follow_ups_due: { enabled: true } })).status).toBe(400);
    expect((await put({ weekly_summary: { day: "someday" } })).status).toBe(400);
  });
});

describe("POST test: Send test", () => {
  it("posts each enabled type once, marked TEST", async () => {
    signIn("crm-editor");
    await put({ google_reviews_to_match: { enabled: false } });
    const res = await sendTest();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      sent: ["online_result_held", "new_sign_ups", "weekly_summary"],
      failed: [],
    });
    expect(h.telegrams).toHaveLength(3);
    for (const text of h.telegrams) expect(text.startsWith("🧪 TEST")).toBe(true);
    expect(audits()).toContain("crm_telegram_updates.test");
  });

  it("needs customers-edit", async () => {
    signIn("crm-viewer");
    expect((await sendTest()).status).toBe(403);
    expect(h.telegrams).toEqual([]);
  });
});
