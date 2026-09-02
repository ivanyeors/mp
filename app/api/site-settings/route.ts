import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { invalidateTag } from "@/lib/cache/invalidate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";
import { landingAssetIdKey } from "@/lib/media/replace";

export const runtime = "nodejs";

type SiteSettingRow = { key: string; value: string; updated_at: string | null };

/**
 * Site settings change rarely and are read on nearly every admin screen, so the
 * DB read is cached and invalidated by every writer via the `site-settings` tag.
 * Uses the service-role client only — no cookies/headers inside the cached fn.
 */
const readSiteSettings = unstable_cache(
  async (keys: string[] | null): Promise<SiteSettingRow[]> => {
    const admin = supabaseAdmin();
    let query = admin.from("site_settings").select("key, value, updated_at");
    if (keys && keys.length > 0) query = query.in("key", keys);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as SiteSettingRow[];
  },
  ["site-settings-list"],
  { tags: ["site-settings"], revalidate: 300 },
);

/**
 * GET /api/site-settings
 * Optionally accepts ?keys=key1,key2 to filter.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keysParam = searchParams.get("keys");
  // Normalise before the cached read: the key list is part of the cache key,
  // so dedupe + sort so equivalent requests share an entry, and cap it so a
  // caller cannot mint unbounded entries.
  const keys = keysParam
    ? Array.from(new Set(keysParam.split(",").map((k) => k.trim()).filter(Boolean))).sort()
    : null;

  try {
    if (keys && keys.length > 50) {
      return NextResponse.json({ error: "Too many keys (max 50)" }, { status: 400 });
    }
    const settings = await readSiteSettings(keys && keys.length > 0 ? keys : null);
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/site-settings
 * Body: { key: string, value: string, media_asset_id?: string | null }
 *
 * Landing slots (`landing_*`): value = hosted URL; optional media_asset_id
 * dual-writes companion key `landing_*_asset_id` (slice 15).
 */
export async function PUT(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { key, value, media_asset_id } = body as {
      key?: string;
      value?: string;
      media_asset_id?: string | null;
    };

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'key'" }, { status: 400 });
    }
    if (value === undefined || value === null || typeof value !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'value'" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await admin
      .from("site_settings")
      .upsert({ key, value, updated_at: now }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Dual-write Asset id for landing slots
    if (key.startsWith("landing_") && !key.endsWith("_asset_id")) {
      const idKey = landingAssetIdKey(key);
      if (typeof media_asset_id === "string" && media_asset_id.length > 0) {
        const { error: idErr } = await admin
          .from("site_settings")
          .upsert(
            { key: idKey, value: media_asset_id, updated_at: now },
            { onConflict: "key" },
          );
        if (idErr) {
          return NextResponse.json({ error: idErr.message }, { status: 500 });
        }
      } else if (media_asset_id === null) {
        await admin.from("site_settings").delete().eq("key", idKey);
      }
    }

    if (key.startsWith("landing_") && value.startsWith("http")) {
      await touchLastUsed({
        urls: [value],
        assetIds:
          typeof media_asset_id === "string" && media_asset_id ? [media_asset_id] : [],
      }).catch(() => {});
    }

    invalidateTag("site-settings");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/site-settings?key=landing_hero
 * Removes a setting so the default is used again.
 * Also clears companion landing_*_asset_id when resetting a landing slot.
 */
export async function DELETE(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing 'key' query param" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const keys = [key];
  if (key.startsWith("landing_") && !key.endsWith("_asset_id")) {
    keys.push(landingAssetIdKey(key));
  }

  const { error } = await admin.from("site_settings").delete().in("key", keys);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  invalidateTag("site-settings");
  return NextResponse.json({ ok: true });
}
