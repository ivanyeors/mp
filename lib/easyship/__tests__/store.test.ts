import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ row: null as unknown, upserted: null as unknown }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.row, error: null }) }) }),
      upsert: async (v: { config: unknown }) => {
        h.upserted = v.config;
        return { error: null };
      },
    }),
  }),
}));

const { readEasyshipConfig, writeEasyshipConfig } = await import("@/lib/easyship/store");

beforeEach(() => {
  h.upserted = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("an invalid saved doc", () => {
  it("reads as no settings with the reason, and survives a sync-state write", async () => {
    const bad = { addresses: "nope" };
    h.row = { config: { settings: bad, sync: { last_at: "t0" } } };
    const cfg = await readEasyshipConfig();
    expect(cfg.settings).toBeNull();
    expect(cfg.settingsError).toMatch(/\w/);

    await writeEasyshipConfig({ sync: { last_at: "t1", report: null, webhook_secret_token: null, easyship_company_id: null } });
    expect(h.upserted).toEqual({ settings: bad, sync: expect.objectContaining({ last_at: "t1" }) });
  });
});
