import { getSiteSettings } from "@/lib/site-settings";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  assertCatalogAllowsSave,
  parseDiscoverySourceCatalog,
  serializeDiscoverySourceCatalog,
} from "./catalog";
import {
  DISCOVERY_SOURCE_SETTING_KEY,
  type DiscoverySourceCatalog,
} from "./types";

export {
  activeDiscoverySourceOptions,
  archiveDiscoverySourceOption,
  assertCatalogAllowsSave,
  findDiscoverySourceOption,
  normalizeDiscoverySourceCatalog,
  parseDiscoverySourceCatalog,
  resolveDiscoverySourceLabel,
  serializeDiscoverySourceCatalog,
} from "./catalog";
export { DEFAULT_DISCOVERY_SOURCE_CATALOG } from "./defaults";
export {
  normalizeDiscoverySourceOther,
  OTHER_TEXT_MIN_LENGTH,
  validateDiscoverySource,
} from "./validate";
export {
  DISCOVERY_SOURCE_SETTING_KEY,
  OTHER_DISCOVERY_SOURCE_ID,
  type DiscoverySourceCatalog,
  type DiscoverySourceField,
  type DiscoverySourceInput,
  type DiscoverySourceLabels,
  type DiscoverySourceOption,
  type DiscoverySourceValidationError,
} from "./types";

export async function getDiscoverySourceCatalog(): Promise<DiscoverySourceCatalog> {
  const stored = await getSiteSettings([DISCOVERY_SOURCE_SETTING_KEY]);
  return parseDiscoverySourceCatalog(stored[DISCOVERY_SOURCE_SETTING_KEY]);
}

export async function saveDiscoverySourceCatalog(
  catalog: DiscoverySourceCatalog,
): Promise<{ ok: true; catalog: DiscoverySourceCatalog } | { ok: false; error: string }> {
  const checked = assertCatalogAllowsSave(catalog);
  if (!checked.ok) return checked;

  const admin = supabaseAdmin();
  const { error } = await admin.from("site_settings").upsert(
    {
      key: DISCOVERY_SOURCE_SETTING_KEY,
      value: serializeDiscoverySourceCatalog(checked.catalog),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, catalog: checked.catalog };
}
