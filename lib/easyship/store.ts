import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { easyshipConfig } from "@/lib/shipping/easyship";
import { invalidateTag } from "@/lib/cache/invalidate";
import { typeBoxes } from "@/lib/shipping/parcels";
import { EasyshipSettingsSchema, type EasyshipAddress, type EasyshipSettings } from "./schema";
import type { SyncReport } from "./sync-report";

const SLUG = "easyship";

export type EasyshipSyncState = {
  last_at: string | null;
  report: SyncReport | null;
  webhook_secret_token: string | null;
  easyship_company_id: string | null;
};

export type EasyshipConfig = { settings: EasyshipSettings | null; sync: EasyshipSyncState; settingsError?: string | null };

type Row = { settings?: unknown; sync?: Partial<EasyshipSyncState> };

const EMPTY_SYNC: EasyshipSyncState = {
  last_at: null,
  report: null,
  webhook_secret_token: null,
  easyship_company_id: null,
};

async function readRow(): Promise<Row> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("api_configs").select("config").eq("slug", SLUG).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.config ?? {}) as Row;
}

function parseRow(cfg: Row): EasyshipConfig {
  const sync = { ...EMPTY_SYNC, ...(cfg.sync ?? {}) };
  if (cfg.settings == null) return { settings: null, sync, settingsError: null };
  const parsed = EasyshipSettingsSchema.safeParse(cfg.settings);
  if (parsed.success) return { settings: parsed.data, sync, settingsError: null };
  const settingsError = parsed.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "settings"}: ${i.message}`)
    .join("; ");
  console.error("[easyship] Saved courier settings are invalid, live rates are off:", settingsError);
  return { settings: null, sync, settingsError };
}

export async function readEasyshipConfig(): Promise<EasyshipConfig> {
  return parseRow(await readRow());
}

export async function readSenderAddress(): Promise<EasyshipAddress | null> {
  const { settings } = await readEasyshipConfig();
  return settings?.addresses.find((a) => a.default_for.sender) ?? null;
}

export async function writeEasyshipConfig(patch: Partial<EasyshipConfig>): Promise<EasyshipConfig> {
  const raw = await readRow();
  const current = parseRow(raw);
  const next: EasyshipConfig = {
    settings: patch.settings ?? current.settings,
    sync: { ...current.sync, ...(patch.sync ?? {}) },
    settingsError: patch.settings ? null : current.settingsError,
  };
  const admin = supabaseAdmin();
  const { error } = await admin.from("api_configs").upsert(
    {
      slug: SLUG,
      name: "Easyship",
      base_url: easyshipConfig()?.baseUrl ?? "https://public-api.easyship.com/2024-09",
      config: { settings: patch.settings ?? raw.settings ?? null, sync: next.sync },
      is_active: true,
    },
    { onConflict: "slug" },
  );
  if (error) throw new Error(error.message);
  invalidateTag("api-configs");
  return next;
}

export const readTypeBoxes = unstable_cache(
  async () => typeBoxes((await readEasyshipConfig()).settings),
  ["easyship-type-boxes"],
  { tags: ["api-configs"], revalidate: 300 },
);
