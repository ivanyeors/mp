import { describe, it, expect } from "vitest";
import { shouldRevealRecommendation } from "../reveal";
import {
  resolveAssignHintTemplateId,
  selectAssignHintSource,
} from "../assign-hint";
import { plainLanguageWhy } from "../why";
import type { RecommendationRecord } from "../recommendation-record";

const baseRecord = (
  over: Partial<RecommendationRecord> = {},
): RecommendationRecord => ({
  graphVersionId: "g1",
  flow: "premium-mpillow",
  entryFlow: "premium-mpillow",
  finalFlow: "premium-mpillow",
  size: "L",
  templateId: "42",
  tierSuggestion: null,
  soldTier: "premium",
  flowRoute: null,
  flowRouteDecision: null,
  firedTerminals: [],
  trace: [
    { nodeId: "in-shoulder", type: "input", detail: "shoulder_length_cm" },
    { nodeId: "sz-l", type: "size-output", detail: "band:L" },
  ],
  usedFallback: false,
  usedLegacyBootstrap: false,
  ...over,
});

describe("shouldRevealRecommendation", () => {
  it("hides when inputs incomplete", () => {
    expect(
      shouldRevealRecommendation({ requiredInputsComplete: false }),
    ).toBe(false);
  });

  it("hides when a Flow route is unresolved (upsell pending)", () => {
    expect(
      shouldRevealRecommendation({
        requiredInputsComplete: true,
        flowRouteUnresolved: true,
      }),
    ).toBe(false);
  });

  it("reveals when inputs complete and route resolved", () => {
    expect(
      shouldRevealRecommendation({
        requiredInputsComplete: true,
        flowRouteUnresolved: false,
      }),
    ).toBe(true);
  });
});

describe("plainLanguageWhy", () => {
  it("names the measurement band and size, not node ids", () => {
    const why = plainLanguageWhy(baseRecord(), { sleep_position: "side" });
    expect(why).toContain("Shoulder band L");
    expect(why).toContain("Side sleeping");
    expect(why).toContain("Size L");
    expect(why).not.toMatch(/sz-l|in-shoulder|node/i);
  });
});

describe("assign hint source", () => {
  it("prefers engine template when in scope", () => {
    expect(
      selectAssignHintSource({
        engineTemplateId: 42,
        sizeScopeChanged: false,
        hasAssistFillingSnapshot: false,
      }),
    ).toBe("engine");
    expect(
      resolveAssignHintTemplateId({
        engineTemplateId: 42,
        defaultTemplateId: 7,
        sizeScopeChanged: false,
        hasAssistFillingSnapshot: true, // assist is truth; engine still the hint
      }),
    ).toBe(42);
  });

  it("falls back to default when size scope changes", () => {
    expect(
      selectAssignHintSource({
        engineTemplateId: 42,
        sizeScopeChanged: true,
        hasAssistFillingSnapshot: false,
      }),
    ).toBe("default");
    expect(
      resolveAssignHintTemplateId({
        engineTemplateId: 42,
        defaultTemplateId: 7,
        sizeScopeChanged: true,
        hasAssistFillingSnapshot: false,
      }),
    ).toBe(7);
  });
});
