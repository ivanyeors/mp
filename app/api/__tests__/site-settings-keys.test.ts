import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  rows: [] as { key: string; value: string; updated_at: string | null }[],
  writes: [] as string[],
}));

vi.mock("@/lib/auth/admin", () => ({ requireAdmin: vi.fn(async () => null) }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: vi.fn() }));
vi.mock("@/lib/media-assets", () => ({ touchLastUsed: vi.fn(async () => undefined) }));
vi.mock("@/lib/media/replace", () => ({ landingAssetIdKey: (k: string) => `${k}_asset_id` }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => {
    const b = {
      from: () => b,
      select: () => b,
      in: () => b,
      eq: () => b,
      upsert: (row: { key: string }) => (h.writes.push(`upsert:${row.key}`), b),
      delete: () => (h.writes.push("delete"), b),
      then: (resolve: (v: unknown) => void) => resolve({ data: h.rows, error: null }),
    };
    return b;
  },
}));

const route = await import("@/app/api/site-settings/route");

const put = (key: string) =>
  route.PUT(new Request("http://x/api/site-settings", { method: "PUT", body: JSON.stringify({ key, value: "x" }) }));

beforeEach(() => {
  h.rows = [
    { key: "landing_hero", value: "https://img/hero.webp", updated_at: null },
    { key: "rma_return_address", value: "1 Studio Road", updated_at: null },
    { key: "results_sla_ops_email", value: "ops@example.com", updated_at: null },
  ];
  h.writes = [];
});

describe("site-settings serves landing slots only", () => {
  it.each(["rma_return_address", "results_sla_ops_email", "appointments_fitting_booking_url"])(
    "PUT %s → 403, nothing written",
    async (key) => {
      expect((await put(key)).status).toBe(403);
      expect(h.writes).toEqual([]);
    },
  );

  it("PUT landing_hero → 200", async () => {
    expect((await put("landing_hero")).status).toBe(200);
    expect(h.writes).toContain("upsert:landing_hero");
  });

  it("DELETE a non-landing key → 403", async () => {
    const res = await route.DELETE(new Request("http://x/api/site-settings?key=rma_return_address", { method: "DELETE" }));
    expect(res.status).toBe(403);
    expect(h.writes).toEqual([]);
  });

  it("GET asking for a non-landing key → 403", async () => {
    const res = await route.GET(new Request("http://x/api/site-settings?keys=landing_hero,results_sla_ops_email"));
    expect(res.status).toBe(403);
  });

  it("GET with no keys returns only landing rows", async () => {
    const res = await route.GET(new Request("http://x/api/site-settings"));
    const body = (await res.json()) as { settings: { key: string }[] };
    expect(body.settings.map((r) => r.key)).toEqual(["landing_hero"]);
  });
});
