import { beforeEach, describe, expect, it, vi } from "vitest";
import { POINTS_DEFAULTS } from "@/lib/points/settings";

const h = vi.hoisted(() => ({ permissions: new Set<string>(), save: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminContext: vi.fn(async (p: string) => {
    if (!h.permissions.has(p)) throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return { memberId: "m1", userId: "u1", email: "owner@mpillow.com", permissions: h.permissions };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/points/server", () => ({
  readPointsSettings: vi.fn(async () => POINTS_DEFAULTS),
  readPointsSummary: vi.fn(async () => ({ outstanding: 0 })),
  savePointsSettings: h.save,
}));

const { GET, PUT } = await import("../route");
const put = (body: unknown) => PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = new Set(["discounts"]);
});

describe("points settings", () => {
  it("needs discounts", async () => {
    h.permissions = new Set(["customers"]);
    expect((await GET()).status).toBe(403);
    expect((await put(POINTS_DEFAULTS)).status).toBe(403);
  });

  it("refuses turning points on without a launch date", async () => {
    const res = await put({ ...POINTS_DEFAULTS, enabled: true });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("launchAt");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("saves valid settings and audits them", async () => {
    const res = await put({ ...POINTS_DEFAULTS, enabled: true, launchAt: "2026-11-01T00:00:00+08:00" });
    expect(res.status).toBe(200);
    expect(h.save).toHaveBeenCalledWith({}, expect.objectContaining({ enabled: true, launchAt: "2026-11-01T00:00:00+08:00" }));
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "points_settings.update" }));
  });
});
