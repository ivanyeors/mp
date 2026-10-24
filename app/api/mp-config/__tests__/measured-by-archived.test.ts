import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Slice 07: an archived Staff profile cannot be newly picked as a Result's
 * "measured by", but a Result that already names it keeps it.
 */

const h = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  upsert: vi.fn(),
  pickable: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAnyAdmin: vi.fn().mockResolvedValue(null),
  requireAdmin: vi.fn().mockResolvedValue(null),
  getAdminContext: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/results/access", async (orig) => ({
  ...(await orig<typeof import("@/lib/results/access")>()),
  requireResultAccess: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/staff/admin", () => ({ isPickableStaffProfile: h.pickable }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = { from: () => b, select: () => b, eq: () => b, maybeSingle: h.maybeSingle, upsert: h.upsert };
    return b;
  },
}));

const { POST } = await import("@/app/api/mp-config/responses/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAFF = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const post = () =>
  POST(
    new Request("https://x.test/api/mp-config/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ID, data: {}, measuredBy: { type: "staff", staffId: STAFF } }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.upsert.mockResolvedValue({ error: null });
});

describe("measured by an archived Staff profile", () => {
  it("is refused when newly picked", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: "draft", measured_by_staff_id: null }, error: null });
    h.pickable.mockResolvedValue(false);
    const res = await post();
    expect(res).toBeInstanceOf(NextResponse);
    expect(res.status).toBe(400);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("is kept on a Result that already names it", async () => {
    h.maybeSingle.mockResolvedValue({ data: { status: "draft", measured_by_staff_id: STAFF }, error: null });
    h.pickable.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.pickable).not.toHaveBeenCalled();
  });
});
