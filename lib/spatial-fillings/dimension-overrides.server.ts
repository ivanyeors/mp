/**
 * Server-side loader for the dimension overrides an x-ray host needs
 * (slice 12 / slice 02). Both tables are service-role only under RLS, so a
 * route loads them here and ships them beside the colour overrides; the
 * client folds them over the code registry with `registryFromPayload`. The
 * soft cut settings (ADR 0025) ride along, read in the same site settings
 * query as the loft allowance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  LOFT_ALLOWANCE_SETTING_KEY,
  type DimensionOverrideRow,
  type DimensionOverridesPayload,
  type NeckSupportOverrideRow,
} from "./dimension-overrides";
import { SOFT_BODY_SETTING_KEY } from "./soft-body-settings";

const POUCH_COLUMNS =
  "key, width_mm, length_mm, thickness_mm, min_thickness_mm, min_width_mm, orientation, flat_length_mm, flat_width_mm, updated_at";
const NECK_COLUMNS = "size, width_mm, length_mm, thickness_mm, min_thickness_mm, updated_at";

/** Throws on a database error, like the callers' other reads. */
export async function loadDimensionOverrides(admin: SupabaseClient): Promise<DimensionOverridesPayload> {
  const [rows, neckRows, settings] = await Promise.all([
    admin.from("filling_dimension_overrides").select(POUCH_COLUMNS),
    admin.from("neck_support_dimension_overrides").select(NECK_COLUMNS),
    admin.from("site_settings").select("key, value").in("key", [LOFT_ALLOWANCE_SETTING_KEY, SOFT_BODY_SETTING_KEY]),
  ]);
  for (const r of [rows, neckRows, settings]) {
    if (r.error) throw new Error(r.error.message);
  }
  const setting = (key: string) =>
    ((settings.data ?? []) as { key: string; value: string }[]).find((s) => s.key === key)?.value ?? null;
  return {
    pouches: (rows.data ?? []) as DimensionOverrideRow[],
    neck: (neckRows.data ?? []) as NeckSupportOverrideRow[],
    loftAllowance: setting(LOFT_ALLOWANCE_SETTING_KEY),
    softBody: setting(SOFT_BODY_SETTING_KEY),
  };
}
