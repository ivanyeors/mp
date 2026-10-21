import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Customers → Settings → Aftercare (CRM slice 07). Seeing the card needs
 * `customers`; changing a setting needs `customers-edit`. Each value is its own
 * `site_settings` key, every change is audited, and a link that is not https
 * is refused. Real permission checks, through the shared fake admin; the card's
 * numbers (a dry run of the daily job) are stubbed here and tested in
 * lib/aftercare.
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
            const list = (h.db[table] ??= []);
            for (const row of rows) {
              const at = list.findIndex((r) => r.key === row.key);
              if (at >= 0) list[at] = { ...list[at], ...row };
              else list.push({ ...row });
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
vi.mock("@/lib/aftercare/card-server", async (orig) => {
  const real = await orig<typeof import("@/lib/aftercare/card-server")>();
  return {
    ...real,
    readAftercareCard: async (admin: Parameters<typeof real.readAftercareSettings>[0]) => ({
      settings: await real.readAftercareSettings(admin),
      reviewRequests: { today: { candidates: 2 }, last30: { asked: 0, opened: 0, email: 0, whatsapp: 0 }, googleReviewsLinked: null },
      checkups: { today: { candidates: 1 }, last90: { sent: 0, email: 0, whatsapp: 0, followedByBooking: 0 } },
      whatsapp: { senderConfigured: false, reviewTemplate: null, checkupTemplate: null },
      openStopRequests: 0,
    }),
  };
});

const route = await import("../aftercare/route");

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

const get = () => route.GET(new Request("https://x.test/api/settings/customers/aftercare"));
const put = (body: unknown) =>
  route.PUT(
    new Request("https://x.test/api/settings/customers/aftercare", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
const stored = (key: string) => (h.db.site_settings ?? []).find((r) => r.key === key)?.value;
const audits = () => (h.db.admin_audit_log ?? []).map((r) => r.action);

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [
      role("owner", [], true),
      role("crm-editor", ["customers", "customers-edit"]),
      role("crm-viewer", ["customers"]),
      role("orders-only", ["orders"]),
    ],
    admin_users: [],
    // As seeded by 20261020124000_customer_review_requests.sql and
    // 20261020133000_checkup_reminders.sql.
    site_settings: [
      { key: "review_requests_enabled", value: "false" },
      { key: "review_request_days_after", value: "14" },
      { key: "review_request_max_age_days", value: "60" },
      { key: "google_review_url", value: "https://g.page/r/CfdGhvgB1hwUEBM/review" },
      { key: "checkup_reminders_enabled", value: "false" },
      { key: "checkup_months", value: "12" },
    ],
    admin_audit_log: [],
  };
});

describe("GET: seeing the card needs customers", () => {
  it("returns the seeded settings and what this role may change", async () => {
    signIn("crm-viewer");
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      settings: {
        reviewRequests: {
          enabled: false,
          daysAfter: 14,
          maxAgeDays: 60,
          googleReviewUrl: "https://g.page/r/CfdGhvgB1hwUEBM/review",
        },
        checkups: { enabled: false, months: 12 },
      },
      checkups: { today: { candidates: 1 } },
      canEdit: false,
    });
  });

  it.each(["crm-editor", "owner"])("%s may change it", async (roleId) => {
    signIn(roleId);
    expect(await (await get()).json()).toMatchObject({ canEdit: true });
  });

  it("refuses a role without customers", async () => {
    signIn("orders-only");
    expect((await get()).status).toBe(403);
  });
});

describe("PUT: changing it needs customers-edit", () => {
  it("refuses a view-only role, and changes nothing", async () => {
    signIn("crm-viewer");
    expect((await put({ review_requests_enabled: true })).status).toBe(403);
    expect(stored("review_requests_enabled")).toBe("false");
    expect(audits()).toEqual([]);
  });

  it("writes each changed key and audits the change", async () => {
    signIn("crm-editor");
    const res = await put({ review_requests_enabled: true, review_request_days_after: 21 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      ok: true,
      settings: { reviewRequests: { enabled: true, daysAfter: 21, maxAgeDays: 60 } },
    });
    expect(stored("review_requests_enabled")).toBe("true");
    expect(stored("review_request_days_after")).toBe("21");
    expect(stored("review_request_max_age_days")).toBe("60");
    expect(audits()).toEqual(["aftercare_settings.update"]);
  });

  it("refuses a link that is not https, a window that ends before it starts, and unknown keys", async () => {
    signIn("owner");
    expect((await put({ google_review_url: "http://g.page/r/x/review" })).status).toBe(400);
    expect((await put({ review_request_days_after: 90 })).status).toBe(400);
    expect((await put({ checkup_cadence: 12 })).status).toBe(400);
    expect((await put({ review_request_days_after: 0 })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect(stored("google_review_url")).toBe("https://g.page/r/CfdGhvgB1hwUEBM/review");
    expect(audits()).toEqual([]);
  });

  it("changes the Check-up reminder's switch and period on customers-edit only (CRM slice 08)", async () => {
    signIn("crm-viewer");
    expect((await put({ checkup_reminders_enabled: true })).status).toBe(403);
    expect(stored("checkup_reminders_enabled")).toBe("false");

    signIn("crm-editor");
    const res = await put({ checkup_reminders_enabled: true, checkup_months: 18 });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ settings: { checkups: { enabled: true, months: 18 } } });
    expect(stored("checkup_reminders_enabled")).toBe("true");
    expect(stored("checkup_months")).toBe("18");
    expect(audits()).toEqual(["aftercare_settings.update"]);

    for (const months of [0, 37, 1.5]) expect((await put({ checkup_months: months })).status).toBe(400);
    expect(stored("checkup_months")).toBe("18");
  });

  it("lets the link be cleared, which stops sending", async () => {
    signIn("owner");
    expect((await put({ google_review_url: "" })).status).toBe(200);
    expect(stored("google_review_url")).toBe("");
  });
});
