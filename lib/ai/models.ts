/**
 * The Claude models AI writing may call (PRD-campaign-email-editor decision
 * 10, slice 16). The one list of model ids in code: General → AI writing picks
 * from it, and a stored setting naming anything else reads as the default, so
 * a typo can never call a model that does not exist. Adding a model is a code
 * change, with its prices from Anthropic's pricing page on the day it is added.
 *
 * Pure: the settings section imports it in the browser.
 */

/** Every `output_config.effort` level the Messages API knows. */
export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

export interface AiModel {
  id: string;
  label: string;
  /** US$ per million input tokens. */
  inputPerMillionUsd: number;
  /** US$ per million output tokens. */
  outputPerMillionUsd: number;
  /** The effort levels the model accepts. */
  efforts: readonly AiEffort[];
}

export const AI_MODELS = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    inputPerMillionUsd: 4,
    outputPerMillionUsd: 20,
    // Thinking is always on; effort is its only dial, and defaults to medium.
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
] as const satisfies readonly AiModel[];

export type AiModelId = (typeof AI_MODELS)[number]["id"];

/** The first in the list: what AI writing uses until the owner picks another. */
export const DEFAULT_AI_MODEL_ID: AiModelId = AI_MODELS[0].id;

export function isAiModelId(id: unknown): id is AiModelId {
  return AI_MODELS.some((m) => m.id === id);
}

/** The list's entry for `id`, or null for a model the list does not hold. */
export function aiModel(id: string): AiModel | null {
  return AI_MODELS.find((m) => m.id === id) ?? null;
}

/** What `inputTokens` in and `outputTokens` out cost on `model`, in US$. */
export function tokenCostUsd(model: AiModel, inputTokens: number, outputTokens: number): number {
  return (inputTokens * model.inputPerMillionUsd + outputTokens * model.outputPerMillionUsd) / 1_000_000;
}
