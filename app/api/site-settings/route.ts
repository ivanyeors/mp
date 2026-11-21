import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { invalidateTag } from "@/lib/cache/invalidate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";
import { landingAssetIdKey } from "@/lib/media/replace";

export const runtime = "nodejs";

type SiteSettingRow = { key: string; value: string; updated_at: string | null };

const isLandingKey = (key: string) => key.startsWith("landing_");

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

export async function GET(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const keysParam = searchParams.get("keys");
  const keys = keysParam
    ? Array.from(new Set(keysParam.split(",").map((k) => k.trim()).filter(Boolean))).sort()
    : null;

  try {
    if (keys && keys.length > 50) {
      return NextResponse.json({ error: "Too many keys (max 50)" }, { status: 400 });
    }
    if (keys?.some((k) => !isLandingKey(k))) {
      return NextResponse.json({ error: "Only landing_* keys are served here" }, { status: 403 });
    }
    const rows = await readSiteSettings(keys && keys.length > 0 ? keys : null);
    const settings = rows.filter((r) => isLandingKey(r.key));
    return NextResponse.json({ ok: true, settings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request) {
  const denied = await requireAdmin("media");
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
    if (!isLandingKey(key)) {
      return NextResponse.json({ error: "Only landing_* keys are written here" }, { status: 403 });
    }

    const admin = supabaseAdmin();
    const now = new Date().toISOString();
    const { error } = await admin
      .from("site_settings")
      .upsert({ key, value, updated_at: now }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

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

export async function DELETE(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing 'key' query param" }, { status: 400 });
  }
  if (!isLandingKey(key)) {
    return NextResponse.json({ error: "Only landing_* keys are removed here" }, { status: 403 });
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
