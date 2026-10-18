import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  SOFT_BODY_DEFAULTS,
  SOFT_BODY_SETTING_KEY,
  softBodySettingsToStored,
  type SoftBodySettings,
} from "@/lib/spatial-fillings/soft-body-settings";

/**
 * Settings → Soft body (ADR 0025): the route reads, saves and resets the one
 * site setting every cut draws with — validated against the sliders' ranges,
 * cache expired and audited on each change, Configure's key on every method.
 */

type Row = { key: string; value: string; updated_at: string | null };

const h = vi.hoisted(() => ({
  row: null as Row | null,
  upserts: [] as Array<{ table: string; row: Row; options: unknown }>,
  deletes: [] as Array<{ table: string; key: string }>,
  denied: null as Response | null,
  requireAdmin: vi.fn(),
  audit: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: h.requireAdmin,
  getAdminContext: vi.fn().mockResolvedValue({ userId: "u1", email: "ops@example.com" }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: h.invalidate }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let key: string | null = null;
      const q = {
        select: () => q,
        eq(_column: string, value: string) {
          key = value;
          return q;
        },
        maybeSingle: async () => ({
          data: table === "site_settings" && h.row && h.row.key === key ? { value: h.row.value, updated_at: h.row.updated_at } : null,
          error: null,
        }),
        upsert: async (row: Row, options: unknown) => {
          h.upserts.push({ table, row, options });
          h.row = row;
          return { error: null };
        },
        delete: () => ({
          eq: async (_column: string, value: string) => {
            h.deletes.push({ table, key: value });
            if (h.row?.key === value) h.row = null;
            return { error: null };
          },
        }),
      };
      return q;
    },
  }),
}));

const { GET, POST, DELETE } = await import("@/app/[lang]/settings/product-builder/soft-body/route");

const post = (body: unknown) =>
  POST(
    new NextRequest("https://x.test/en-US/settings/product-builder/soft-body", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const tuned: SoftBodySettings = {
  enabled: false,
  rigidity: 72,
  volumePct: 110,
  emptyCasePct: 45,
  smoothing: 3,
  gap: 2.5,
  steps: 30,
  animate: false,
};

const storedRow = (settings: SoftBodySettings): Row => ({
  key: SOFT_BODY_SETTING_KEY,
  value: softBodySettingsToStored(settings),
  updated_at: "2026-10-17T08:00:00.000Z",
});

beforeEach(() => {
  vi.clearAllMocks();
  h.row = null;
  h.upserts = [];
  h.deletes = [];
  h.denied = null;
  h.requireAdmin.mockImplementation(async () => h.denied);
});

describe("GET", () => {
  it("is the defaults, not stored, without a row", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      settings: SOFT_BODY_DEFAULTS,
      stored: false,
      updatedAt: null,
      defaults: SOFT_BODY_DEFAULTS,
    });
  });

  it("is the stored row when there is one", async () => {
    h.row = storedRow(tuned);
    expect(await (await GET()).json()).toEqual({
      settings: tuned,
      stored: true,
      updatedAt: "2026-10-17T08:00:00.000Z",
      defaults: SOFT_BODY_DEFAULTS,
    });
  });
});

describe("POST", () => {
  it("upserts the validated JSON on the setting key, expires the cache and returns what is stored", async () => {
    const res = await post({ settings: tuned });
    expect(res.status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    expect(h.upserts[0]).toMatchObject({ table: "site_settings", options: { onConflict: "key" } });
    expect(h.upserts[0].row.key).toBe(SOFT_BODY_SETTING_KEY);
    expect(JSON.parse(h.upserts[0].row.value)).toEqual(tuned);
    expect(h.invalidate).toHaveBeenCalledWith("site-settings");
    const body = await res.json();
    expect(body).toMatchObject({ settings: tuned, stored: true, defaults: SOFT_BODY_DEFAULTS });
    expect(body.updatedAt).toBe(h.upserts[0].row.updated_at);
  });

  it("audits the change with the row before (none) and after", async () => {
    await post({ settings: tuned });
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      actor: { userId: "u1" },
      action: "xray.soft_body_update",
      entityType: "site_settings",
      entityId: SOFT_BODY_SETTING_KEY,
      before: null,
      after: tuned,
    });

    await post({ settings: { ...tuned, rigidity: 20 } });
    expect(h.audit.mock.calls[1][0]).toMatchObject({ before: tuned, after: { ...tuned, rigidity: 20 } });
  });

  it("saves but does not audit a save that changes nothing", async () => {
    h.row = storedRow(tuned);
    expect((await post({ settings: tuned })).status).toBe(200);
    expect(h.upserts).toHaveLength(1);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("snaps a value between steps to the slider's step", async () => {
    const res = await post({ settings: { ...tuned, gap: 3.3 } });
    expect(res.status).toBe(200);
    expect(JSON.parse(h.upserts[0].row.value).gap).toBe(3.5);
    expect((await res.json()).settings.gap).toBe(3.5);
  });

  it.each([
    ["a number below its range", { ...tuned, rigidity: -1 }],
    ["a number above its range", { ...tuned, volumePct: 181 }],
    ["a number as text", { ...tuned, steps: "24" }],
    ["a boolean as text", { ...tuned, enabled: "true" }],
    ["a missing key", { ...tuned, smoothing: undefined }],
  ])("refuses %s with a 400 and writes nothing", async (_label, settings) => {
    const res = await post({ settings });
    expect(res.status).toBe(400);
    expect(h.upserts).toHaveLength(0);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("refuses a body without settings", async () => {
    expect((await post(tuned)).status).toBe(400);
    expect((await post(null)).status).toBe(400);
  });
});

describe("DELETE", () => {
  it("deletes the row, expires the cache, audits the reset and returns the defaults", async () => {
    h.row = storedRow(tuned);
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(h.deletes).toEqual([{ table: "site_settings", key: SOFT_BODY_SETTING_KEY }]);
    expect(h.invalidate).toHaveBeenCalledWith("site-settings");
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.audit.mock.calls[0][0]).toMatchObject({
      action: "xray.soft_body_reset",
      entityType: "site_settings",
      entityId: SOFT_BODY_SETTING_KEY,
      before: tuned,
      after: null,
    });
    expect(await res.json()).toEqual({
      settings: SOFT_BODY_DEFAULTS,
      stored: false,
      updatedAt: null,
      defaults: SOFT_BODY_DEFAULTS,
    });
  });

  it("does not audit a reset with nothing stored", async () => {
    expect((await DELETE()).status).toBe(200);
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe("guard", () => {
  it("asks for Configure's key on every method and returns its denial untouched", async () => {
    h.denied = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const responses = [await GET(), await post({ settings: tuned }), await DELETE()];
    for (const res of responses) expect(res.status).toBe(403);
    expect(h.requireAdmin.mock.calls).toEqual([["configure"], ["configure"], ["configure"]]);
    expect(h.upserts).toHaveLength(0);
    expect(h.deletes).toHaveLength(0);
  });
});
