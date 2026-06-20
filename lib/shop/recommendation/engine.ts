import type { CustomizationResult } from "@/lib/types/customization";
import { callModelEndpoint, getModelConfig, type ModelEndpointConfig } from "./model";
import { parseModelResult } from "./schema";

/**
 * Single entry point for producing a recommendation. It first attempts the
 * configured, active real-model endpoint and validates its response; on a
 * missing endpoint, an invalid response shape, or a request failure it returns
 * the guaranteed rule-based recommendation. Genuine fallbacks (a configured
 * endpoint that failed or returned garbage) are logged.
 *
 * Dependencies are injectable so the engine can be tested without I/O.
 */
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

  // No configured/active endpoint: rule-based is the normal path (not logged).
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
