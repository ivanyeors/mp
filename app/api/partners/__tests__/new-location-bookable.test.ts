import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn(async () => null) }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn(), invalidateTags: vi.fn() }));
vi.mock("@/lib/partners", () => ({ listAdminLocationRows: vi.fn(async () => []) }));
vi.mock("@/lib/media-assets", () => ({ touchLastUsed: vi.fn(async () => undefined) }));

const { POST } = await import("../route");

async function add(body: Record<string, unknown>) {
  const res = await POST(
    new Request("http://test.local/api/partners", { method: "POST", body: JSON.stringify(body) }),
  );
  expect(res.status).toBe(201);
  return h.db.partners.at(-1);
}

beforeEach(() => {
  h.db = { partners: [] };
});

describe("POST /api/partners: whether a new Location takes bookings", () => {
  it("adds a partner not taking bookings", async () => {
    expect(await add({ name: "Alignwell", type: "partner", address: "1 Clinic Road" })).toMatchObject({
      type: "partner",
      bookable: false,
    });
  });

  it("adds a partner not taking bookings when the type is left out", async () => {
    expect(await add({ name: "Alignwell" })).toMatchObject({ type: "partner", bookable: false });
  });

  it("adds an own studio taking bookings", async () => {
    expect(await add({ name: "Mpillow Singapore", type: "own", address: "22 Sin Ming Lane" })).toMatchObject({
      type: "own",
      bookable: true,
    });
  });

  it("keeps what the request says", async () => {
    expect(await add({ name: "Alignwell", type: "partner", bookable: true })).toMatchObject({ bookable: true });
    expect(await add({ name: "Closed studio", type: "own", bookable: false })).toMatchObject({ bookable: false });
  });
});
