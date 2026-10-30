import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_WRITING_DEFAULTS, AI_WRITING_SETTING_KEYS, aiWritingSettingsToRows } from "@/lib/ai/writing-settings";

/**
 * `readAiWritingSettings` is read at every AI writing call (PRD-campaign-email-editor
 * slice 16): a stale value reads as its default, and a failed read turns AI
 * writing off for that call.
 */

const h = vi.hoisted(() => ({ admin: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.admin }));

const { AI_WRITING_READ_FAILED, readAiWritingSettings, saveAiWritingSettings } = await import("@/lib/ai/settings");

function fakeAdmin(result: { data: { key: string; value: string }[] | null; error: { message: string } | null }) {
  const inKeys = vi.fn(async () => result);
  const upsert = vi.fn(async () => ({ error: result.error }));
  const admin = { from: vi.fn(() => ({ select: () => ({ in: inKeys }), upsert })) } as unknown as SupabaseClient;
  return { admin, inKeys, upsert };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("readAiWritingSettings", () => {
  it("reads the six keys as typed settings", async () => {
    const saved = { ...AI_WRITING_DEFAULTS, limitDay: 30, effortDraft: "high" as const };
    const { admin, inKeys } = fakeAdmin({ data: aiWritingSettingsToRows(saved), error: null });
    expect(await readAiWritingSettings(admin)).toEqual({ ok: true, settings: saved });
    expect(inKeys).toHaveBeenCalledWith("key", Object.values(AI_WRITING_SETTING_KEYS));
  });

  it("uses the service-role client when none is passed", async () => {
    h.admin = fakeAdmin({ data: [], error: null }).admin;
    expect(await readAiWritingSettings()).toEqual({ ok: true, settings: AI_WRITING_DEFAULTS });
  });

  it("reads a model removed from the list as the default model", async () => {
    const { admin } = fakeAdmin({ data: [{ key: AI_WRITING_SETTING_KEYS.model, value: "a-model-since-removed" }], error: null });
    const read = await readAiWritingSettings(admin);
    expect(read.ok && read.settings.model).toBe(AI_WRITING_DEFAULTS.model);
  });

  it("turns AI writing off when the read fails, even though it is stored on", async () => {
    const { admin } = fakeAdmin({ data: null, error: { message: "connection reset" } });
    const read = await readAiWritingSettings(admin);
    expect(read).toEqual({ ok: false, error: AI_WRITING_READ_FAILED, settings: { ...AI_WRITING_DEFAULTS, enabled: false } });
    expect(AI_WRITING_READ_FAILED).toBe("Couldn't read the AI writing settings. Try again.");
  });

  it("turns AI writing off when the client throws", async () => {
    const admin = { from: () => { throw new Error("no service role key"); } } as unknown as SupabaseClient;
    const read = await readAiWritingSettings(admin);
    expect(read.ok).toBe(false);
    expect(read.settings.enabled).toBe(false);
  });
});

describe("saveAiWritingSettings", () => {
  it("upserts every key", async () => {
    const { admin, upsert } = fakeAdmin({ data: [], error: null });
    await saveAiWritingSettings(admin, AI_WRITING_DEFAULTS);
    const [savedRows, opts] = upsert.mock.calls[0] as unknown as [{ key: string; value: string }[], unknown];
    expect(savedRows.map(({ key, value }) => ({ key, value }))).toEqual(aiWritingSettingsToRows(AI_WRITING_DEFAULTS));
    expect(opts).toEqual({ onConflict: "key" });
  });

  it("throws when the write fails", async () => {
    const { admin } = fakeAdmin({ data: [], error: { message: "denied" } });
    await expect(saveAiWritingSettings(admin, AI_WRITING_DEFAULTS)).rejects.toThrow("Could not save the AI writing settings: denied");
  });
});
