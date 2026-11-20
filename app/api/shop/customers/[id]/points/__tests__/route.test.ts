import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  standing: vi.fn(),
  permissions: new Set<string>(),
  adjust: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: vi.fn(async (p: string) =>
    h.permissions.has(p) ? null : new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
  ),
  requireAdminContext: vi.fn(async (p: string) => {
    if (!h.permissions.has(p)) throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return { memberId: "m1", userId: "u1", email: "staff@mpillow.com", permissions: h.permissions };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/staff/working-as", () => ({ getWorkingAs: vi.fn(async () => ({ id: "profile-1", name: "Ivan" })) }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/points/server", () => ({
  readPointsBalance: vi.fn(async () => ({ available: 500, pending: 120 })),
  readPendingOrders: vi.fn(async () => []),
  readPointsHistory: vi.fn(async () => []),
  isPartnerCustomer: vi.fn(async () => false),
  readPointsSettings: vi.fn(async () => ({ enabled: false, milestones: [{ at: 1000, bonus: 100 }, { at: 2500, bonus: 300 }] })),
  readMilestoneStanding: h.standing,
  adjustPoints: h.adjust,
}));

const { GET, POST } = await import("../route");
const ID = "5a1d3c2e-7b4f-4e6a-9c8d-0f1e2d3c4b5a";
const params = Promise.resolve({ id: ID });
const post = (body: unknown) =>
  POST(new Request("http://x", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }), { params });

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = new Set(["customers", "customers-edit"]);
  h.adjust.mockResolvedValue({ ok: true, available: 1000 });
  h.standing.mockResolvedValue({ earned: 1200, granted: 1 });
});

describe("GET", () => {
  it("needs customers, and returns the balance", async () => {
    h.permissions = new Set();
    expect((await GET(new Request("http://x"), { params })).status).toBe(403);
    h.permissions = new Set(["customers"]);
    const res = await GET(new Request("http://x"), { params });
    expect(res.status).toBe(200);
    const { view } = await res.json();
    expect(view.balance.available).toBe(500);
    expect(view.milestones).toEqual({ earned: 1200, reached: 1, total: 2 });
  });

  it("still returns the balance when the milestones can't be read", async () => {
    h.standing.mockRejectedValue(new Error('relation "points_milestone_progress" does not exist'));
    const res = await GET(new Request("http://x"), { params });
    expect(res.status).toBe(200);
    const { view } = await res.json();
    expect(view.balance.available).toBe(500);
    expect(view.milestones).toBeNull();
  });

  it("answers 404 for an id that is not one", async () => {
    expect((await GET(new Request("http://x"), { params: Promise.resolve({ id: "nope" }) })).status).toBe(404);
  });
});

describe("POST: a Staff adjustment", () => {
  it("needs customers-edit", async () => {
    h.permissions = new Set(["customers"]);
    expect((await post({ points: 500, note: "Goodwill" })).status).toBe(403);
    expect(h.adjust).not.toHaveBeenCalled();
  });

  it("refuses zero, a fraction, no reason, or extra fields", async () => {
    for (const body of [{ points: 0, note: "x" }, { points: 1.5, note: "x" }, { points: 5, note: "  " }, { points: 5, note: "x", customerId: "other" }]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(h.adjust).not.toHaveBeenCalled();
  });

  it("writes the entry with the Staff profile, and audits it", async () => {
    const res = await post({ points: -200, note: " Order cancelled by us " });
    expect(res.status).toBe(200);
    expect(h.adjust).toHaveBeenCalledWith({}, { customerId: ID, points: -200, note: "Order cancelled by us", profileId: "profile-1" });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "customer.points_adjust", entityId: ID, after: expect.objectContaining({ points: -200 }) }));
  });

  it("passes on the ledger's refusal (a partner, below zero)", async () => {
    h.adjust.mockResolvedValue({ ok: false, error: "Partners do not hold points" });
    const res = await post({ points: 100, note: "x" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Partners/);
    expect(h.audit).not.toHaveBeenCalled();
  });
});
