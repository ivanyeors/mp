export const AI_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
export type AiEffort = (typeof AI_EFFORTS)[number];

export interface AiModel {
  id: string;
  label: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  efforts: readonly AiEffort[];
}

export const AI_MODELS = [
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    inputPerMillionUsd: 4,
    outputPerMillionUsd: 20,
    efforts: ["low", "medium", "high", "xhigh", "max"],
  },
] as const satisfies readonly AiModel[];

export type AiModelId = (typeof AI_MODELS)[number]["id"];

export const DEFAULT_AI_MODEL_ID: AiModelId = AI_MODELS[0].id;

export function isAiModelId(id: unknown): id is AiModelId {
  return AI_MODELS.some((m) => m.id === id);
}

export function aiModel(id: string): AiModel | null {
  return AI_MODELS.find((m) => m.id === id) ?? null;
}

export function tokenCostUsd(model: AiModel, inputTokens: number, outputTokens: number): number {
  return (inputTokens * model.inputPerMillionUsd + outputTokens * model.outputPerMillionUsd) / 1_000_000;
}
