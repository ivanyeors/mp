import { supabaseAdmin } from "@/lib/supabase/server";

export interface ModelEndpointConfig {
  base_url: string;
  api_key: string | null;
  config: Record<string, unknown>;
}

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
