import { describe, it, expect, vi } from "vitest";
import { recommendWithFallback, type EngineDeps } from "@/lib/shop/recommendation/engine";
import type { ModelEndpointConfig } from "@/lib/shop/recommendation/model";
import type { CustomizationResult } from "@/lib/types/customization";

const RULE_BASED: CustomizationResult = {
  recommended_size: "M",
  recommended_kind: "basic",
  filling_lines: [{ item_id: 1, subtype: "3D-L", name: "3D Large", quantity: 1 }],
  summary: "rule-based",
  explanation: "rule-based fallback",
};

const MODEL_RESULT: CustomizationResult = {
  recommended_size: "L",
  recommended_kind: "premium",
  filling_lines: [{ item_id: 9, subtype: "6D-L", name: "6D Large", quantity: 2 }],
  summary: "model",
  explanation: "from the model endpoint",
};

const ACTIVE_CONFIG: ModelEndpointConfig = {
  base_url: "https://model.example/recommend",
  api_key: "secret",
  config: { model: "v1" },
};

function makeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function silentDeps(extra: Partial<EngineDeps>): EngineDeps {
  return { logger: () => {}, ...extra };
}

describe("recommendWithFallback — model path", () => {
  it("uses a valid model response as-is and does not run the rule-based path", async () => {
    const ruleBased = vi.fn(() => RULE_BASED);
    const fetchImpl = vi.fn(async () => makeResponse(MODEL_RESULT));

    const result = await recommendWithFallback(
      { preferences: { x: 1 } },
      ruleBased,
      silentDeps({ loadConfig: async () => ACTIVE_CONFIG, fetchImpl }),
    );

    expect(result).toEqual(MODEL_RESULT);
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(ruleBased).not.toHaveBeenCalled();
  });

  it("falls back to rule-based when the model returns an invalid shape", async () => {
    const ruleBased = vi.fn(() => RULE_BASED);
    const fetchImpl = vi.fn(async () => makeResponse({ nonsense: true }));
    const logger = vi.fn();

    const result = await recommendWithFallback(
      { preferences: {} },
      ruleBased,
      { loadConfig: async () => ACTIVE_CONFIG, fetchImpl, logger },
    );

    expect(result).toEqual(RULE_BASED);
    expect(ruleBased).toHaveBeenCalledOnce();
    expect(logger).toHaveBeenCalledWith(expect.stringContaining("invalid_shape"));
  });

  it("falls back to rule-based on a non-2xx HTTP response", async () => {
    const ruleBased = vi.fn(() => RULE_BASED);
    const fetchImpl = vi.fn(async () => makeResponse({}, false, 500));
    const logger = vi.fn();

    const result = await recommendWithFallback(
      { preferences: {} },
      ruleBased,
      { loadConfig: async () => ACTIVE_CONFIG, fetchImpl, logger },
    );

    expect(result).toEqual(RULE_BASED);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining("model_request_failed"),
      expect.anything(),
    );
  });

  it("falls back to rule-based on a network error", async () => {
    const ruleBased = vi.fn(() => RULE_BASED);
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await recommendWithFallback(
      { preferences: {} },
      ruleBased,
      silentDeps({ loadConfig: async () => ACTIVE_CONFIG, fetchImpl }),
    );

    expect(result).toEqual(RULE_BASED);
    expect(ruleBased).toHaveBeenCalledOnce();
  });
});

describe("recommendWithFallback — missing/misconfigured endpoint", () => {
  it("uses rule-based when no config is present", async () => {
    const ruleBased = vi.fn(() => RULE_BASED);
    const fetchImpl = vi.fn();

    const result = await recommendWithFallback(
      { preferences: {} },
      ruleBased,
      silentDeps({ loadConfig: async () => null, fetchImpl }),
    );

    expect(result).toEqual(RULE_BASED);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses rule-based when loading the config throws", async () => {
    const ruleBased = vi.fn(() => RULE_BASED);

    const result = await recommendWithFallback(
      { preferences: {} },
      ruleBased,
      silentDeps({
        loadConfig: async () => {
          throw new Error("db error");
        },
      }),
    );

    expect(result).toEqual(RULE_BASED);
    expect(ruleBased).toHaveBeenCalledOnce();
  });
});
