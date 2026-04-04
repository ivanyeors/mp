import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/site-settings
 * Optionally accepts ?keys=key1,key2 to filter.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const keysParam = searchParams.get("keys");

  const admin = supabaseAdmin();
  let query = admin.from("site_settings").select("key, value, updated_at");

  if (keysParam) {
    const keys = keysParam.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length > 0) {
      query = query.in("key", keys);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, settings: data ?? [] });
}

/**
 * PUT /api/site-settings
 * Body: { key: string, value: string }
 * Upserts a single setting.
 */
export async function PUT(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  try {
    const body = await req.json();
    const { key, value } = body as { key?: string; value?: string };

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'key'" }, { status: 400 });
    }
    if (value === undefined || value === null || typeof value !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'value'" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { error } = await admin
      .from("site_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/site-settings?key=landing_hero
 * Removes a setting so the default is used again.
 */
export async function DELETE(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing 'key' query param" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from("site_settings").delete().eq("key", key);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
