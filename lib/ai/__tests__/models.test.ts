import { describe, expect, it } from "vitest";
import { AI_EFFORTS, AI_MODELS, DEFAULT_AI_MODEL_ID, aiModel, isAiModelId, tokenCostUsd } from "@/lib/ai/models";

/** The model list (PRD-campaign-email-editor slice 16): the one place model ids live. */

describe("the model list", () => {
  it("starts with Claude Opus 5.5 at US$4 / US$20 a million tokens, taking every effort", () => {
    expect(aiModel(DEFAULT_AI_MODEL_ID)).toEqual(
      expect.objectContaining({ label: "Claude Opus 5.5", inputPerMillionUsd: 4, outputPerMillionUsd: 20, efforts: [...AI_EFFORTS] }),
    );
    expect(DEFAULT_AI_MODEL_ID).toBe(AI_MODELS[0].id);
  });

  it("holds each id once, with a label and prices", () => {
    expect(new Set(AI_MODELS.map((m) => m.id)).size).toBe(AI_MODELS.length);
    for (const m of AI_MODELS) {
      expect(m.label).not.toBe("");
      expect(m.inputPerMillionUsd).toBeGreaterThan(0);
      expect(m.outputPerMillionUsd).toBeGreaterThan(0);
      expect(m.efforts.every((e) => (AI_EFFORTS as readonly string[]).includes(e))).toBe(true);
    }
  });

  it("knows only its own ids", () => {
    expect(isAiModelId(DEFAULT_AI_MODEL_ID)).toBe(true);
    expect(isAiModelId("not-a-model")).toBe(false);
    expect(isAiModelId(undefined)).toBe(false);
    expect(aiModel("not-a-model")).toBeNull();
  });

  it("prices tokens per million, in and out", () => {
    const model = aiModel(DEFAULT_AI_MODEL_ID)!;
    expect(tokenCostUsd(model, 1_000_000, 0)).toBe(4);
    expect(tokenCostUsd(model, 0, 1_000_000)).toBe(20);
    expect(tokenCostUsd(model, 3_000, 3_000)).toBeCloseTo(0.072, 10);
  });
});
