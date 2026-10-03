import { supabaseAdmin } from "@/lib/supabase/server";
import { easyshipConfig } from "@/lib/shipping/easyship";
import { invalidateTag } from "@/lib/cache/invalidate";
import { EasyshipSettingsSchema, type EasyshipSettings } from "./schema";
import type { SyncReport } from "./sync-report";

/** Desired state + sync bookkeeping live in the `easyship` row of api_configs (service-role only). */
const SLUG = "easyship";

export type EasyshipSyncState = {
  last_at: string | null;
  report: SyncReport | null;
  webhook_secret_token: string | null;
  easyship_company_id: string | null;
};

export type EasyshipConfig = { settings: EasyshipSettings | null; sync: EasyshipSyncState };

const EMPTY_SYNC: EasyshipSyncState = {
  last_at: null,
  report: null,
  webhook_secret_token: null,
  easyship_company_id: null,
};

export async function readEasyshipConfig(): Promise<EasyshipConfig> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("api_configs").select("config").eq("slug", SLUG).maybeSingle();
  if (error) throw new Error(error.message);
  const cfg = (data?.config ?? {}) as { settings?: unknown; sync?: Partial<EasyshipSyncState> };
  const parsed = EasyshipSettingsSchema.safeParse(cfg.settings);
  return {
    settings: parsed.success ? parsed.data : null,
    sync: { ...EMPTY_SYNC, ...(cfg.sync ?? {}) },
  };
}

export async function writeEasyshipConfig(patch: Partial<EasyshipConfig>): Promise<EasyshipConfig> {
  const current = await readEasyshipConfig();
  const next: EasyshipConfig = {
    settings: patch.settings ?? current.settings,
    sync: { ...current.sync, ...(patch.sync ?? {}) },
  };
  const admin = supabaseAdmin();
  const { error } = await admin.from("api_configs").upsert(
    {
      slug: SLUG,
      name: "Easyship",
      base_url: easyshipConfig()?.baseUrl ?? "https://public-api.easyship.com/2024-09",
      config: next,
      is_active: true,
    },
    { onConflict: "slug" },
  );
  if (error) throw new Error(error.message);
  invalidateTag("api-configs");
  return next;
}
