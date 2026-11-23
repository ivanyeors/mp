import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_WRITING_DEFAULTS, type AiWritingSettings } from "@/lib/ai/writing-settings";

const h = vi.hoisted(() => ({
  permissions: new Set<string>(),
  stored: null as AiWritingSettings | null,
  readFails: false,
  save: vi.fn(),
  audit: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdminContext: vi.fn(async (p: string) => {
    if (!h.permissions.has(p)) throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    return { memberId: "m1", userId: "u1", email: "owner@example.com", permissions: h.permissions };
  }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/cache/invalidate", () => ({ invalidateTag: h.invalidate }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/ai/settings", () => ({
  readAiWritingSettings: vi.fn(async () =>
    h.readFails
      ? { ok: false, error: "Couldn't read the AI writing settings. Try again.", settings: { ...AI_WRITING_DEFAULTS, enabled: false } }
      : { ok: true, settings: h.stored ?? AI_WRITING_DEFAULTS },
  ),
  saveAiWritingSettings: vi.fn(async (_admin: unknown, s: AiWritingSettings) => {
    h.save(s);
    h.stored = s;
  }),
}));

const { PUT } = await import("../route");
const put = (body: unknown) =>
  PUT(new Request("http://x", { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.permissions = new Set(["api-configs"]);
  h.stored = null;
  h.readFails = false;
});

describe("AI writing settings route", () => {
  it("needs api-configs", async () => {
    h.permissions = new Set(["campaigns"]);
    expect((await put(AI_WRITING_DEFAULTS)).status).toBe(403);
    expect(h.save).not.toHaveBeenCalled();
  });

  it("refuses a model not in the list", async () => {
    const res = await put({ ...AI_WRITING_DEFAULTS, model: "not-a-model" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Pick a model from the list.", field: "model" });
    expect(h.save).not.toHaveBeenCalled();
  });

  it("refuses an effort AI writing does not offer", async () => {
    const res = await put({ ...AI_WRITING_DEFAULTS, effortQuick: "max" });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("effortQuick");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("refuses a limit out of range", async () => {
    const res = await put({ ...AI_WRITING_DEFAULTS, limitDay: 501 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "At most 500.", field: "limitDay" });
  });

  it("saves, audits before and after, and clears the settings cache", async () => {
    const next = { ...AI_WRITING_DEFAULTS, limitDay: 30 };
    const res = await put(next);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, settings: next });
    expect(h.save).toHaveBeenCalledWith(next);
    expect(h.invalidate).toHaveBeenCalledWith("site-settings");
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "settings.ai_writing",
        entityType: "site_setting",
        entityId: "ai_writing",
        before: AI_WRITING_DEFAULTS,
        after: next,
      }),
    );
  });

  it("does not save over settings it could not read", async () => {
    h.readFails = true;
    const res = await put({ ...AI_WRITING_DEFAULTS, enabled: false });
    expect(res.status).toBe(500);
    expect(h.save).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });
});
