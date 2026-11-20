import { beforeEach, describe, expect, it, vi } from "vitest";

const PREVIEW = {
  customers: 1613,
  points: 2379749,
  spend: 793350.25,
  median: 1374,
  largest: 25336,
  grantedCustomers: 0,
  grantedPoints: 0,
  partnersLeftOut: 0,
  earnPerDollar: 3,
};

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  grant: vi.fn(),
  preview: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminContext: vi.fn(async (p: string) => {
    if (!h.permissions.has(p)) throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return { memberId: "m1", userId: "u1", email: "owner@mpillow.com", permissions: h.permissions };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "staff-1", name: "Sophie" })) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/points/server", () => ({
  readPastPurchasePreview: h.preview,
  grantPastPurchasePoints: h.grant,
}));

const { GET, POST } = await import("../route");
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = new Set(["discounts"]);
  h.preview.mockResolvedValue(PREVIEW);
});

describe("past-purchase points", () => {
  it("needs discounts to see and to run", async () => {
    h.permissions = new Set(["customers", "customers-edit"]);
    expect((await GET()).status).toBe(403);
    expect((await post({ customers: 1, points: 1 })).status).toBe(403);
    expect(h.grant).not.toHaveBeenCalled();
  });

  it("previews", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).preview).toEqual(PREVIEW);
  });

  it("refuses a run with nothing in it", async () => {
    expect((await post({ customers: 0, points: 0 })).status).toBe(400);
    expect((await post({ customers: 3 })).status).toBe(400);
    expect(h.grant).not.toHaveBeenCalled();
  });

  it("grants the numbers it was shown, as the Staff profile, and audits it", async () => {
    h.grant.mockResolvedValue({ ok: true, customers: 1613, points: 2379749 });
    const res = await post({ customers: 1613, points: 2379749 });
    expect(res.status).toBe(200);
    expect(h.grant).toHaveBeenCalledWith({}, { profileId: "staff-1", customers: 1613, points: 2379749 });
    expect((await res.json()).granted).toEqual({ customers: 1613, points: 2379749 });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "points.past_purchases_grant", after: { customers: 1613, points: 2379749 } }),
    );
  });

  it("says when the numbers moved, with the new preview, and audits nothing", async () => {
    h.grant.mockResolvedValue({ ok: false, error: "The numbers changed since the preview" });
    const res = await post({ customers: 1612, points: 2379000 });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/changed/);
    expect(json.preview).toEqual(PREVIEW);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
