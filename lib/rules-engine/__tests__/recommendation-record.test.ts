import { describe, it, expect } from "vitest";
import { evaluateOrThrow } from "../evaluate";
import { premiumSeedGraph } from "../seeds";
import {
  legacyBootstrapRecord,
  parseRecommendationRecord,
  recordFromEvaluate,
  toPersistedRecommendationRecord,
} from "../recommendation-record";
import { recommendWithEngine } from "../recommend";
import type { RuleGraphRow } from "../types";

const graph = premiumSeedGraph({
  XS: "1",
  S: "2",
  M: "3",
  L: "4",
  XL: "5",
});

describe("recommendation-record lifecycle", () => {
  it("recordFromEvaluate captures graph version, terminals, outputs, trace", () => {
    const result = evaluateOrThrow("premium-mpillow", graph, {
      shoulder_length_cm: 42,
      neck_to_back_cm: 10,
      head_to_back_cm: 12,
      neck_length_cm: 10,
    });
    const record = recordFromEvaluate("premium-mpillow", "ver-abc", result, "premium");
    expect(record.graphVersionId).toBe("ver-abc");
    expect(record.size).toBe("M");
    expect(record.templateId).toBe("3");
    expect(record.soldTier).toBe("premium");
    expect(record.usedLegacyBootstrap).toBe(false);
    expect(record.firedTerminals.length).toBeGreaterThan(0);
    expect(record.trace.length).toBeGreaterThan(0);

    const persisted = toPersistedRecommendationRecord(record);
    expect(parseRecommendationRecord(persisted)?.graphVersionId).toBe("ver-abc");
  });

  it("bootstrap path marks usedLegacyBootstrap and null graph version", () => {
    const record = legacyBootstrapRecord("basic-mpillow", "S", "basic");
    expect(record.graphVersionId).toBeNull();
    expect(record.usedLegacyBootstrap).toBe(true);
    expect(record.soldTier).toBe("basic");
  });

  it("recommendWithEngine uses published graph when provided", async () => {
    const published = {
      id: "pub-1",
      flow: "premium-mpillow",
      version: 1,
      status: "published",
      graph,
      author_id: null,
      created_at: "",
      updated_at: "",
      published_at: "",
    } satisfies RuleGraphRow;

    const record = await recommendWithEngine(
      "premium-mpillow",
      {
        shoulder_length_cm: 36,
        neck_to_back_cm: 10,
        head_to_back_cm: 12,
        neck_length_cm: 10,
      },
      { getLatestPublished: async () => published },
    );
    expect("error" in record).toBe(false);
    if ("error" in record) return;
    expect(record.size).toBe("XS");
    expect(record.soldTier).toBe("premium");
    expect(record.graphVersionId).toBe("pub-1");
    expect(record.usedLegacyBootstrap).toBe(false);
  });

  it("recommendWithEngine falls back to legacy when no published graph", async () => {
    const record = await recommendWithEngine(
      "premium-mpillow",
      {
        shoulder_length_cm: 48,
        neck_to_back_cm: 10,
        head_to_back_cm: 12,
        neck_length_cm: 10,
        acid_reflux: true,
      },
      { getLatestPublished: async () => null },
    );
    expect("error" in record).toBe(false);
    if ("error" in record) return;
    expect(record.size).toBe("L");
    expect(record.soldTier).toBe("premium");
    expect(record.tierSuggestion).toBe("premium");
    expect(record.usedLegacyBootstrap).toBe(true);
    expect(record.graphVersionId).toBeNull();
  });
});
