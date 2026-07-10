import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import {
  backfillMediaAssetsFromBucket,
  createMediaAsset,
  listMediaAssets,
} from "@/lib/media-assets";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("q") ?? undefined;
  const kind = searchParams.get("kind") ?? undefined;

  try {
    const assets = await listMediaAssets({ search, kind: kind || undefined });
    return NextResponse.json({ ok: true, assets });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list assets" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  try {
    const body = await req.json();
    if (body?.action === "backfill") {
      const result = await backfillMediaAssetsFromBucket();
      return NextResponse.json({ ok: true, ...result });
    }

    const asset = await createMediaAsset(body);
    return NextResponse.json({ ok: true, asset }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    const status = /required|Invalid|cannot/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
