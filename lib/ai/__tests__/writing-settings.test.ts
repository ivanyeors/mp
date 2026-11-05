import { describe, expect, it } from "vitest";
import { AI_MODELS, DEFAULT_AI_MODEL_ID, type AiModel } from "@/lib/ai/models";
import { AI_WRITING_KINDS } from "@/lib/ai/usage";
import {
  AI_WRITING_DEFAULTS,
  AI_WRITING_SETTING_KEYS,
  AiWritingSettingsSchema,
  aiWritingEffortProblems,
  aiWritingEffortsFor,
  aiWritingRateLimits,
  aiWritingRequest,
  aiWritingSettingsFromRows,
  aiWritingSettingsToRows,
} from "@/lib/ai/writing-settings";

/** General → AI writing (PRD-campaign-email-editor slice 16): parsing, defaults and the checks on save. */

const K = AI_WRITING_SETTING_KEYS;
const rows = (values: Partial<Record<keyof typeof K, string>>) =>
  Object.entries(values).map(([k, value]) => ({ key: K[k as keyof typeof K], value: value as string }));

describe("the defaults", () => {
  it("are on, the list's first model, Medium for drafts, Low for quick actions, 10 in 10 minutes and 60 a day", () => {
    expect(AI_WRITING_DEFAULTS).toEqual({
      enabled: true,
      model: DEFAULT_AI_MODEL_ID,
      effortDraft: "medium",
      effortQuick: "low",
      limit10min: 10,
      limitDay: 60,
    });
    expect(aiWritingSettingsFromRows([])).toEqual(AI_WRITING_DEFAULTS);
  });
});

describe("aiWritingSettingsFromRows", () => {
  it("reads what a save writes", () => {
    const saved = { ...AI_WRITING_DEFAULTS, enabled: false, effortDraft: "high" as const, effortQuick: "medium" as const, limit10min: 5, limitDay: 30 };
    expect(aiWritingSettingsFromRows(aiWritingSettingsToRows(saved))).toEqual(saved);
  });

  it("reads each value that no longer parses as that field's default", () => {
    const s = aiWritingSettingsFromRows(
      rows({ enabled: "maybe", model: "a-model-since-removed", effortDraft: "max", effortQuick: "", limit10min: "0", limitDay: "12.5" }),
    );
    expect(s).toEqual(AI_WRITING_DEFAULTS);
  });

  it("keeps the fields that do parse when another does not", () => {
    const s = aiWritingSettingsFromRows(rows({ enabled: "false", model: "a-model-since-removed", limitDay: "30" }));
    expect(s).toEqual({ ...AI_WRITING_DEFAULTS, enabled: false, limitDay: 30 });
  });

  it("never reads a limit outside its range", () => {
    expect(aiWritingSettingsFromRows(rows({ limit10min: "51", limitDay: "501" }))).toMatchObject({ limit10min: 10, limitDay: 60 });
    expect(aiWritingSettingsFromRows(rows({ limit10min: "50", limitDay: "500" }))).toMatchObject({ limit10min: 50, limitDay: 500 });
  });
});

describe("AiWritingSettingsSchema", () => {
  const ok = { ...AI_WRITING_DEFAULTS };

  it("accepts the defaults", () => {
    expect(AiWritingSettingsSchema.safeParse(ok).success).toBe(true);
  });

  it("refuses a model id not in the list", () => {
    const r = AiWritingSettingsSchema.safeParse({ ...ok, model: "not-a-model" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({ path: ["model"], message: "Pick a model from the list." });
  });

  it("refuses an effort AI writing does not offer", () => {
    for (const effort of ["max", "xhigh", "none", ""]) {
      const r = AiWritingSettingsSchema.safeParse({ ...ok, effortDraft: effort });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual(["effortDraft"]);
    }
  });

  it("refuses limits outside 1–50 and 1–500, or a 10-minute limit above the daily one", () => {
    for (const bad of [{ limit10min: 0 }, { limit10min: 51 }, { limitDay: 0 }, { limitDay: 501 }, { limitDay: 2.5 }]) {
      expect(AiWritingSettingsSchema.safeParse({ ...ok, ...bad }).success).toBe(false);
    }
    const r = AiWritingSettingsSchema.safeParse({ ...ok, limit10min: 20, limitDay: 10 });
    expect(r.error?.issues[0]).toMatchObject({ path: ["limit10min"] });
    expect(AiWritingSettingsSchema.safeParse({ ...ok, limit10min: 50, limitDay: 500 }).success).toBe(true);
  });
});

describe("an effort the model does not accept", () => {
  // A model that takes fewer efforts than the list's first.
  const narrow: AiModel = { id: "narrow-model", label: "Narrow model", inputPerMillionUsd: 1, outputPerMillionUsd: 5, efforts: ["low"] };
  const models = [...AI_MODELS, narrow];

  it("is refused, naming the field and the model", () => {
    expect(aiWritingEffortProblems({ model: "narrow-model", effortDraft: "medium", effortQuick: "low" }, models)).toEqual([
      { path: "effortDraft", message: "Narrow model doesn't take Medium effort." },
    ]);
  });

  it("is not offered", () => {
    expect(aiWritingEffortsFor(narrow)).toEqual(["low"]);
    expect(aiWritingEffortsFor(AI_MODELS[0])).toEqual(["low", "medium", "high"]);
  });

  it("is nothing to refuse on the list's own models at Low, Medium or High", () => {
    for (const effort of ["low", "medium", "high"]) {
      expect(aiWritingEffortProblems({ model: DEFAULT_AI_MODEL_ID, effortDraft: effort, effortQuick: effort })).toEqual([]);
    }
  });
});

describe("the next call", () => {
  it("sends the model and the effort for its kind", () => {
    const s = { ...AI_WRITING_DEFAULTS, effortDraft: "high" as const, effortQuick: "medium" as const };
    expect(aiWritingRequest(s, "draft")).toEqual({ model: DEFAULT_AI_MODEL_ID, effort: "high" });
    expect(aiWritingRequest(s, "translate")).toEqual({ model: DEFAULT_AI_MODEL_ID, effort: "high" });
    // A product's description and its SEO are whole pieces of writing, as a draft is.
    expect(aiWritingRequest(s, "product_description")).toEqual({ model: DEFAULT_AI_MODEL_ID, effort: "high" });
    expect(aiWritingRequest(s, "product_seo")).toEqual({ model: DEFAULT_AI_MODEL_ID, effort: "high" });
    for (const kind of AI_WRITING_KINDS.filter((k) => k !== "draft" && k !== "translate" && !k.startsWith("product_"))) {
      expect(aiWritingRequest(s, kind)).toEqual({ model: DEFAULT_AI_MODEL_ID, effort: "medium" });
    }
  });

  it("counts against the limits as saved, per Staff member", () => {
    expect(aiWritingRateLimits(AI_WRITING_DEFAULTS, "member-1")).toEqual([
      { bucket: "ai-writing-10min", key: "member-1", windowMs: 600_000, max: 10 },
      { bucket: "ai-writing-day", key: "member-1", windowMs: 86_400_000, max: 60 },
    ]);
    // The owner lowers the daily limit to 30: the next call is counted against 30.
    expect(aiWritingRateLimits({ ...AI_WRITING_DEFAULTS, limitDay: 30 }, "member-1")[1]?.max).toBe(30);
  });
});
