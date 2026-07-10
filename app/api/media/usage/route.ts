import { NextResponse } from "next/server";
import { listMediaAssets } from "@/lib/media-assets";
import { buildUsageMap } from "@/lib/media/image-usages";

export const runtime = "nodejs";

/**
 * GET /api/media/usage
 * Returns map of hosted_url → UsageEntry[]. Optional ?url= filter.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filterUrl = searchParams.get("url");

    const assets = await listMediaAssets();
    const refs = assets.map((a) => ({ id: a.id, hosted_url: a.hosted_url }));
    const usageMap = await buildUsageMap(refs);

    if (filterUrl) {
      return NextResponse.json({
        ok: true,
        usages: { [filterUrl]: usageMap[filterUrl] ?? [] },
      });
    }

    return NextResponse.json({ ok: true, usages: usageMap });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
