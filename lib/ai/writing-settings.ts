/**
 * The AI writing settings (PRD-campaign-email-editor decision 10, slice 16):
 * `site_settings` rows the owner edits on Admin Panel → General → AI writing.
 * The server reads them at every AI call (`readAiWritingSettings`,
 * lib/ai/settings.ts); this file holds the keys, the defaults, the parsing and
 * the checks a save must pass. Pure: the settings section imports it in the
 * browser.
 *
 * None of these is a secret (`site_settings` is publicly readable). The
 * Anthropic credentials stay in Vercel. Review replies keep their own settings
 * in code (decision 10).
 */
import { z } from "zod";
import type { RateLimitOptions } from "@/lib/rate-limit";
import { AI_MODELS, DEFAULT_AI_MODEL_ID, aiModel, type AiEffort, type AiModel, type AiModelId } from "./models";
import { AI_WRITING_KIND_EFFORT, type AiWritingKind } from "./usage";

export const AI_WRITING_SETTING_KEYS = {
  enabled: "ai_writing_enabled",
  model: "ai_writing_model",
  effortDraft: "ai_writing_effort_draft",
  effortQuick: "ai_writing_effort_quick",
  limit10min: "ai_writing_limit_10min",
  limitDay: "ai_writing_limit_day",
} as const;

/**
 * The effort levels AI writing offers, where the model accepts them. The API
 * goes higher (xhigh, max), which earns its cost on long agentic work, not on
 * an email.
 */
export const AI_WRITING_EFFORTS = ["low", "medium", "high"] as const satisfies readonly AiEffort[];
export type AiWritingEffort = (typeof AI_WRITING_EFFORTS)[number];

export const AI_WRITING_EFFORT_LABEL: Record<AiWritingEffort, string> = { low: "Low", medium: "Medium", high: "High" };

export interface AiWritingSettings {
  /** Off hides every ✨ button in campaigns. */
  enabled: boolean;
  model: AiModelId;
  /** ✨ Generate and ✨ Translate. */
  effortDraft: AiWritingEffort;
  /** Subject ideas, preview lines and rewriting a block. */
  effortQuick: AiWritingEffort;
  /** AI calls per Staff member in 10 minutes. */
  limit10min: number;
  /** AI calls per Staff member in a day. */
  limitDay: number;
}

export const AI_WRITING_DEFAULTS: AiWritingSettings = {
  enabled: true,
  model: DEFAULT_AI_MODEL_ID,
  effortDraft: "medium",
  effortQuick: "low",
  limit10min: 10,
  limitDay: 60,
};

export const AI_WRITING_LIMIT_RANGE = {
  limit10min: { min: 1, max: 50 },
  limitDay: { min: 1, max: 500 },
} as const;

/** Pure — the efforts AI writing offers on `model`, lowest first. */
export function aiWritingEffortsFor(model: Pick<AiModel, "efforts">): AiWritingEffort[] {
  return AI_WRITING_EFFORTS.filter((e) => model.efforts.includes(e));
}

const isEffort = (v: unknown): v is AiWritingEffort => AI_WRITING_EFFORTS.includes(v as AiWritingEffort);

/** A stored effort the model takes, else the default, else the model's lowest. */
function effortOn(model: AiModel, stored: string | undefined, fallback: AiWritingEffort): AiWritingEffort {
  const offered = aiWritingEffortsFor(model);
  const v = stored?.trim().toLowerCase();
  if (isEffort(v) && offered.includes(v)) return v;
  return offered.includes(fallback) ? fallback : (offered[0] ?? fallback);
}

function limit(stored: string | undefined, range: { min: number; max: number }, fallback: number): number {
  const n = stored == null || stored.trim() === "" ? NaN : Number(stored);
  return Number.isInteger(n) && n >= range.min && n <= range.max ? n : fallback;
}

/**
 * Pure — the settings from `site_settings` rows. Each value that is missing or
 * no longer parses (a model removed from the list, an effort it does not take)
 * reads as that field's default.
 */
export function aiWritingSettingsFromRows(rows: readonly { key: string; value: string | null }[]): AiWritingSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? undefined;
  const d = AI_WRITING_DEFAULTS;
  const enabled = get(AI_WRITING_SETTING_KEYS.enabled)?.trim().toLowerCase();
  const storedModel = get(AI_WRITING_SETTING_KEYS.model)?.trim() ?? "";
  const model = (aiModel(storedModel) ?? aiModel(d.model)) as AiModel;
  return {
    enabled: enabled === "true" ? true : enabled === "false" ? false : d.enabled,
    model: model.id as AiModelId,
    effortDraft: effortOn(model, get(AI_WRITING_SETTING_KEYS.effortDraft), d.effortDraft),
    effortQuick: effortOn(model, get(AI_WRITING_SETTING_KEYS.effortQuick), d.effortQuick),
    limit10min: limit(get(AI_WRITING_SETTING_KEYS.limit10min), AI_WRITING_LIMIT_RANGE.limit10min, d.limit10min),
    limitDay: limit(get(AI_WRITING_SETTING_KEYS.limitDay), AI_WRITING_LIMIT_RANGE.limitDay, d.limitDay),
  };
}

/** Pure — the rows a save writes. */
export function aiWritingSettingsToRows(s: AiWritingSettings): { key: string; value: string }[] {
  return [
    { key: AI_WRITING_SETTING_KEYS.enabled, value: s.enabled ? "true" : "false" },
    { key: AI_WRITING_SETTING_KEYS.model, value: s.model },
    { key: AI_WRITING_SETTING_KEYS.effortDraft, value: s.effortDraft },
    { key: AI_WRITING_SETTING_KEYS.effortQuick, value: s.effortQuick },
    { key: AI_WRITING_SETTING_KEYS.limit10min, value: String(s.limit10min) },
    { key: AI_WRITING_SETTING_KEYS.limitDay, value: String(s.limitDay) },
  ];
}

/**
 * Pure — the efforts in `s` that its model does not take, as the field and
 * the reason. `models` is the list, a seam for tests.
 */
export function aiWritingEffortProblems(
  s: { model: string; effortDraft: string; effortQuick: string },
  models: readonly AiModel[] = AI_MODELS,
): { path: "effortDraft" | "effortQuick"; message: string }[] {
  const model = models.find((m) => m.id === s.model);
  if (!model) return [];
  return (["effortDraft", "effortQuick"] as const).flatMap((path) =>
    model.efforts.includes(s[path] as AiEffort)
      ? []
      : [{ path, message: `${model.label} doesn't take ${AI_WRITING_EFFORT_LABEL[s[path] as AiWritingEffort] ?? s[path]} effort.` }],
  );
}

const limitField = (range: { min: number; max: number }) =>
  z
    .number({ error: "Enter a number." })
    .int("Use a whole number.")
    .min(range.min, `At least ${range.min}.`)
    .max(range.max, `At most ${range.max}.`);

/** What the AI writing section saves, checked on the server. */
export const AiWritingSettingsSchema = z
  .object({
    enabled: z.boolean(),
    model: z.enum(AI_MODELS.map((m) => m.id) as [AiModelId, ...AiModelId[]], { error: "Pick a model from the list." }),
    effortDraft: z.enum(AI_WRITING_EFFORTS, { error: "Pick Low, Medium or High." }),
    effortQuick: z.enum(AI_WRITING_EFFORTS, { error: "Pick Low, Medium or High." }),
    limit10min: limitField(AI_WRITING_LIMIT_RANGE.limit10min),
    limitDay: limitField(AI_WRITING_LIMIT_RANGE.limitDay),
  })
  .superRefine((s, ctx) => {
    for (const p of aiWritingEffortProblems(s)) ctx.addIssue({ code: "custom", path: [p.path], message: p.message });
    if (s.limit10min > s.limitDay) {
      ctx.addIssue({ code: "custom", path: ["limit10min"], message: "The 10-minute limit can't be more than the daily one." });
    }
  });

/** Pure — the model and effort an AI writing call of `kind` sends. */
export function aiWritingRequest(s: AiWritingSettings, kind: AiWritingKind): { model: AiModelId; effort: AiWritingEffort } {
  return { model: s.model, effort: AI_WRITING_KIND_EFFORT[kind] === "draft" ? s.effortDraft : s.effortQuick };
}

/**
 * Pure — the per-Staff allowances an AI writing call counts against, for
 * `rateLimitExceeded` (lib/rate-limit.ts). Every kind counts one. The day is
 * the shared limiter's fixed day, which rolls over at 8 am in Singapore
 * (midnight UTC).
 */
export function aiWritingRateLimits(s: Pick<AiWritingSettings, "limit10min" | "limitDay">, staffKey: string): RateLimitOptions[] {
  return [
    { bucket: "ai-writing-10min", key: staffKey, windowMs: 10 * 60_000, max: s.limit10min },
    { bucket: "ai-writing-day", key: staffKey, windowMs: 24 * 3_600_000, max: s.limitDay },
  ];
}
