import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Configuration for the optional real-model recommendation endpoint, sourced
 * from the `api_configs` row with slug `llm-customization`.
 */
export interface ModelEndpointConfig {
  base_url: string;
  api_key: string | null;
  config: Record<string, unknown>;
}

/**
 * Load the active model-endpoint config. Returns null when no row exists, the
 * row is inactive, or it has no base URL — all of which mean "use rule-based".
 *
 * The active flag is read as `is_active` to match the column actually present
 * on `api_configs` (the admin UI/API also write `is_active`).
 */
export async function getModelConfig(): Promise<ModelEndpointConfig | null> {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("api_configs")
    .select("base_url, api_key, config")
    .eq("slug", "llm-customization")
    .eq("is_active", true)
    .maybeSingle();

  if (!data || !data.base_url) return null;
  return {
    base_url: data.base_url,
    api_key: data.api_key ?? null,
    config: (data.config as Record<string, unknown>) ?? {},
  };
}

/**
 * POST the recommendation request body to the configured model endpoint and
 * return the parsed JSON. Throws on network errors or non-2xx responses so the
 * engine can treat those as a fallback condition.
 */
export async function callModelEndpoint(
  config: ModelEndpointConfig,
  body: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetchImpl(config.base_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
    },
    body: JSON.stringify({ ...body, config: config.config }),
  });

  if (!response.ok) {
    throw new Error(`Model endpoint responded with HTTP ${response.status}`);
  }

  return response.json();
}
