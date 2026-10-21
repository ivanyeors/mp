import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * CRM 05: the Segments routes. Seeing and counting Segments needs `customers`;
 * saving, updating, renaming and archiving need `customers-edit`. Filters are
 * checked by the list's schema on the way in, and anything it would drop is
 * refused. Every change is audited with the name and the filters, never
 * Customer data.
 */

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  identity: null as { id: string; email: string } | null,
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/auth/user", () => ({
  getAuthUser: () => Promise.resolve(h.identity),
  getAuthIdentity: () => Promise.resolve(h.identity),
}));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});

const listRoute = await import("../segments/route");
const itemRoute = await import("../segments/[segmentId]/route");

const CLERK = "00000000-0000-4000-8000-0000000000b2"; // customers-edit, one profile
const LOOKER = "00000000-0000-4000-8000-0000000000b3"; // customers only: view-only
const VIEWER = "00000000-0000-4000-8000-0000000000b5"; // no customers key

const WANG = "11111111-1111-4111-8111-000000000004";

const S_PREMIUM = "5e000000-0000-4000-8000-000000000001";
const S_OLD = "5e000000-0000-4000-8000-000000000002";
const S_ARCHIVED = "5e000000-0000-4000-8000-000000000003";
const MISSING = "5e000000-0000-4000-8000-0000000000ff";

const req = (method: string, body?: unknown) =>
  new Request("https://x.test/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const list = () => listRoute.GET();
const create = (body: unknown) => listRoute.POST(req("POST", body));
const patch = (segmentId: string, body: unknown) =>
  itemRoute.PATCH(req("PATCH", body), { params: Promise.resolve({ segmentId }) });

const signIn = (memberId: string | null) => {
  const m = h.db.admin_users.find((r) => r.id === memberId);
  h.identity = m ? { id: m.auth_user_id as string, email: m.email as string } : null;
};
const segment = (id: string) => h.db.customer_segments.find((s) => s.id === id);

/** Customer data that must never reach the audit log. */
const MEI_EMAIL = "mei.tan@x.test";

beforeEach(() => {
  delete process.env.ADMIN_BOOTSTRAP_EMAILS;
  h.db = {
    admin_roles: [
      { id: "r-staff", key: "staff", name: "Staff", grants_all: false, permissions: ["customers", "customers-edit"] },
      { id: "r-crm-viewer", key: "crm-viewer", name: "CRM viewer", grants_all: false, permissions: ["customers"] },
      { id: "r-viewer", key: "viewer", name: "Viewer", grants_all: false, permissions: ["orders"] },
    ],
    admin_users: [
      { id: CLERK, email: "clerk@x.test", role_id: "r-staff", is_active: true, auth_user_id: "auth-clerk" },
      { id: LOOKER, email: "looker@x.test", role_id: "r-crm-viewer", is_active: true, auth_user_id: "auth-looker" },
      { id: VIEWER, email: "viewer@x.test", role_id: "r-viewer", is_active: true, auth_user_id: "auth-viewer" },
    ],
    mp_staff: [{ id: WANG, name: "Wang Ying", admin_user_id: CLERK, archived_at: null }],
    admin_customer_overview: [
      { id: "c1", email: MEI_EMAIL, bought: ["premium"], last_readjusted_at: null, search_text: `${MEI_EMAIL} mei tan` },
      { id: "c2", email: "kim@x.test", bought: ["premium"], last_readjusted_at: "2026-01-01T00:00:00Z", search_text: "kim@x.test" },
      { id: "c3", email: "ana@x.test", bought: ["basic"], last_readjusted_at: null, search_text: "ana@x.test" },
    ],
    customer_segments: [
      { id: S_PREMIUM, name: "Premium", filters: { bought: "premium" }, filters_version: 1, created_by_profile_id: WANG, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", archived_at: null },
      { id: S_OLD, name: "Old region", filters: { bought: "premium", region: "east" }, filters_version: 1, created_by_profile_id: null, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", archived_at: null },
      { id: S_ARCHIVED, name: "Basic", filters: { bought: "basic" }, filters_version: 1, created_by_profile_id: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z", archived_at: "2026-09-15T00:00:00Z" },
    ],
    admin_audit_log: [],
  };
});

type Row = { id: string; name: string; count: number | null; needsReview: boolean; ignored: string[]; params: Record<string, string> };

describe("seeing Segments", () => {
  it("lists the live ones by name, each with its live count; one that needs review is not counted", async () => {
    signIn(LOOKER);
    const res = await list();
    expect(res.status).toBe(200);
    const { rows } = (await res.json()) as { rows: Row[] };
    expect(rows.map((r) => [r.name, r.count, r.needsReview])).toEqual([
      ["Old region", null, true],
      ["Premium", 2, false],
    ]);
    expect(rows[0]).toMatchObject({ ignored: ["region=east"], params: { bought: "premium" } });
  });

  it("needs customers", async () => {
    signIn(null);
    expect((await list()).status).toBe(401);
    signIn(VIEWER);
    expect((await list()).status).toBe(403);
  });
});

describe("a view-only role", () => {
  it("cannot save, update, rename or archive one", async () => {
    signIn(LOOKER);
    const before = JSON.stringify(h.db.customer_segments);
    expect((await create({ name: "Mine", filters: { bought: "basic" } })).status).toBe(403);
    expect((await patch(S_PREMIUM, { filters: { bought: "basic" } })).status).toBe(403);
    expect((await patch(S_PREMIUM, { name: "Renamed" })).status).toBe(403);
    expect((await patch(S_PREMIUM, { archived: true })).status).toBe(403);
    expect(JSON.stringify(h.db.customer_segments)).toBe(before);
    expect(h.db.admin_audit_log).toEqual([]);
  });
});

describe("saving a Segment", () => {
  it("stores the list's parameters, created by the login's profile, and audits name and filters only", async () => {
    signIn(CLERK);
    const res = await create({ name: "  Premium, never re-adjusted  ", filters: { readjusted: "never", bought: "premium" } });
    expect(res.status).toBe(201);
    const { row } = (await res.json()) as { row: Row };
    expect(row).toMatchObject({ name: "Premium, never re-adjusted", count: 1, needsReview: false });
    expect(segment(row.id)).toMatchObject({
      name: "Premium, never re-adjusted",
      filters: { bought: "premium", readjusted: "never" },
      filters_version: 1,
      created_by_profile_id: WANG,
    });
    expect(h.db.admin_audit_log).toHaveLength(1);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_segment.create",
      entity_type: "customer_segment",
      entity_id: row.id,
      actor_email: "clerk@x.test",
      after: { name: "Premium, never re-adjusted", filters: { bought: "premium", readjusted: "never" }, filters_version: 1 },
    });
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain(MEI_EMAIL);
    expect(JSON.stringify(h.db.admin_audit_log)).not.toContain('"c1"');
  });

  it.each([
    [{ bought: "foo" }, "bought=foo"],
    [{ region: "east" }, "region=east"],
    [{ bought: "premium", sort: "spend" }, "sort=spend"],
  ])("refuses %j, naming it, and saves nothing", async (filters, named) => {
    signIn(CLERK);
    const res = await create({ name: "Bad", filters });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain(named);
    expect(body.refused).toEqual([named]);
    expect(h.db.customer_segments).toHaveLength(3);
    expect(h.db.admin_audit_log).toEqual([]);
  });

  it("refuses a set that chooses every Customer, and a blank or long name", async () => {
    signIn(CLERK);
    expect((await create({ name: "Everyone", filters: {} })).status).toBe(400);
    expect((await create({ name: "   ", filters: { bought: "basic" } })).status).toBe(400);
    expect((await create({ name: "x".repeat(81), filters: { bought: "basic" } })).status).toBe(400);
    expect(h.db.customer_segments).toHaveLength(3);
  });

  it("refuses a live name in use, in any case; an archived one is free", async () => {
    signIn(CLERK);
    const taken = await create({ name: "PREMIUM", filters: { bought: "basic" } });
    expect(taken.status).toBe(409);
    expect((await taken.json()).error).toMatch(/already exists/);
    expect((await create({ name: "basic", filters: { bought: "basic" } })).status).toBe(201);
  });
});

describe("changing a Segment", () => {
  it("updates its filters, which clears Needs review, and audits before and after", async () => {
    signIn(CLERK);
    const res = await patch(S_OLD, { filters: { bought: "premium" } });
    expect(res.status).toBe(200);
    const { row } = (await res.json()) as { row: Row };
    expect(row).toMatchObject({ needsReview: false, ignored: [], count: 2 });
    expect(segment(S_OLD)?.filters).toEqual({ bought: "premium" });
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_segment.update",
      entity_id: S_OLD,
      before: { name: "Old region", filters: { bought: "premium", region: "east" }, filters_version: 1 },
      after: { name: "Old region", filters: { bought: "premium" }, filters_version: 1 },
    });
  });

  it("refuses new filters the schema would drop", async () => {
    signIn(CLERK);
    const res = await patch(S_PREMIUM, { filters: { bought: "premium,platinum" } });
    expect(res.status).toBe(400);
    expect(segment(S_PREMIUM)?.filters).toEqual({ bought: "premium" });
  });

  it("renames it, refusing a live name in use", async () => {
    signIn(CLERK);
    expect((await patch(S_PREMIUM, { name: "old REGION" })).status).toBe(409);
    const res = await patch(S_PREMIUM, { name: "Premium buyers" });
    expect(res.status).toBe(200);
    expect(segment(S_PREMIUM)?.name).toBe("Premium buyers");
    expect(h.db.admin_audit_log).toHaveLength(1);
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_segment.rename",
      before: { name: "Premium" },
      after: { name: "Premium buyers", filters: { bought: "premium" } },
    });
  });

  it("archives it: gone from the row, its name free, and audited", async () => {
    signIn(CLERK);
    const res = await patch(S_PREMIUM, { archived: true });
    expect(res.status).toBe(200);
    expect(segment(S_PREMIUM)?.archived_at).toEqual(expect.any(String));
    expect(h.db.admin_audit_log[0]).toMatchObject({
      action: "customer_segment.archive",
      entity_id: S_PREMIUM,
      before: { name: "Premium", filters: { bought: "premium" }, archived_at: null },
    });
    const { rows } = (await (await list()).json()) as { rows: Row[] };
    expect(rows.map((r) => r.name)).toEqual(["Old region"]);
    expect((await create({ name: "Premium", filters: { bought: "premium" } })).status).toBe(201);
    // An archived Segment cannot be changed.
    expect((await patch(S_PREMIUM, { name: "Again" })).status).toBe(404);
    expect((await patch(S_ARCHIVED, { archived: true })).status).toBe(404);
  });

  it("takes one change at a time, and 404s an unknown Segment", async () => {
    signIn(CLERK);
    expect((await patch(S_PREMIUM, { name: "A", archived: true })).status).toBe(400);
    expect((await patch(S_PREMIUM, { archived: false })).status).toBe(400);
    expect((await patch(S_PREMIUM, { colour: "red" })).status).toBe(400);
    expect((await patch(MISSING, { name: "A" })).status).toBe(404);
    expect((await patch("not-a-uuid", { name: "A" })).status).toBe(404);
    expect(h.db.admin_audit_log).toEqual([]);
  });
});
