import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getMediaAsset } from "@/lib/media-assets";
import { listAssetUsages } from "@/lib/media/image-usages";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  const { id } = await params;
  try {
    const asset = await getMediaAsset(id);
    if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const usages = await listAssetUsages({
      id: asset.id,
      hosted_url: asset.hosted_url,
    });
    return NextResponse.json({
      ok: true,
      used: usages.length > 0,
      usages,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to resolve usage" },
      { status: 500 },
    );
  }
}
