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

/**
 * API configs are edited rarely and read on every integration screen. Cached
 * behind the `api-configs` tag, which the write handlers invalidate.
 * Service-role read only — the cookie-based auth check stays outside.
 */
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
