import type { CustomizationResult } from "@/lib/types/customization";
import { callModelEndpoint, getModelConfig, type ModelEndpointConfig } from "./model";
import { parseModelResult } from "./schema";

export interface EngineDeps {
  loadConfig?: () => Promise<ModelEndpointConfig | null>;
  fetchImpl?: typeof fetch;
  logger?: (message: string, meta?: Record<string, unknown>) => void;
}

const defaultLogger = (message: string, meta?: Record<string, unknown>) => {
  console.warn(`[recommendation] ${message}`, meta ?? {});
};

export async function recommendWithFallback(
  modelBody: Record<string, unknown>,
  computeRuleBased: () => CustomizationResult | Promise<CustomizationResult>,
  deps: EngineDeps = {},
): Promise<CustomizationResult> {
  const loadConfig = deps.loadConfig ?? getModelConfig;
  const log = deps.logger ?? defaultLogger;

  let config: ModelEndpointConfig | null = null;
  try {
    config = await loadConfig();
  } catch (error) {
    log("config_load_failed; using rule-based", { error: String(error) });
    config = null;
  }

  if (!config?.base_url) {
    return computeRuleBased();
  }

  try {
    const raw = await callModelEndpoint(config, modelBody, deps.fetchImpl);
    const validated = parseModelResult(raw);
    if (validated) return validated;
    log("model_response_invalid_shape; falling back to rule-based");
  } catch (error) {
    log("model_request_failed; falling back to rule-based", { error: String(error) });
  }

  return computeRuleBased();
}
