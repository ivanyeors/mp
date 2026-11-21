import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ApiConfigRow = {
  id: string;
  name: string;
  slug: string;
  base_url: string;
  api_key: string;
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
};

export const readApiConfigs = unstable_cache(
  async (): Promise<ApiConfigRow[]> => {
    const admin = supabaseAdmin();
    const { data, error } = await admin
      .from("api_configs")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ApiConfigRow[];
  },
  ["api-configs-list"],
  { tags: ["api-configs"], revalidate: 300 },
);

export type ClientApiConfigRow = Omit<ApiConfigRow, "api_key"> & {
  api_key: "";
  api_key_set: boolean;
};

function syncOf(config: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const sync = config?.sync;
  return sync && typeof sync === "object" && !Array.isArray(sync) ? (sync as Record<string, unknown>) : null;
}

export function toClientApiConfig(row: ApiConfigRow): ClientApiConfigRow {
  const sync = syncOf(row.config);
  let config = row.config ?? {};
  if (sync && "webhook_secret_token" in sync) {
    const { webhook_secret_token, ...rest } = sync;
    config = { ...config, sync: { ...rest, webhook_secret_set: Boolean(webhook_secret_token) } };
  }
  return { ...row, config, api_key: "", api_key_set: Boolean(row.api_key) };
}

export function keepStoredSecrets<T extends { api_key?: string; config?: Record<string, unknown> }>(
  existing: Pick<ApiConfigRow, "api_key" | "config">,
  updates: T,
): T {
  const next = { ...updates };
  if (!next.api_key) delete next.api_key;
  const storedSecret = syncOf(existing.config)?.webhook_secret_token;
  if (next.config && storedSecret) {
    const sync = { ...(syncOf(next.config) ?? {}) };
    delete sync.webhook_secret_set;
    next.config = { ...next.config, sync: { ...sync, webhook_secret_token: sync.webhook_secret_token ?? storedSecret } };
  }
  return next;
}
