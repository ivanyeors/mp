import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { runReplaceEverywhere, type ReplaceInput } from "@/lib/media/replace";

export const runtime = "nodejs";

/**
 * POST /api/media/replace
 * Body: { oldUrl, newUrl, oldAssetId?, newAssetId? }
 *
 * Swaps references across blogs, landing slots (+ dual-write asset ids),
 * landing sections, products, categories, partners, partners page.
 * Does not touch order_items snapshots.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin("media");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { oldUrl, newUrl, oldAssetId, newAssetId } = body as {
      oldUrl?: string;
      newUrl?: string;
      oldAssetId?: string | null;
      newAssetId?: string | null;
    };

    if (!oldUrl || typeof oldUrl !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'oldUrl'" }, { status: 400 });
    }
    if (!newUrl || typeof newUrl !== "string") {
      return NextResponse.json({ error: "Missing or invalid 'newUrl'" }, { status: 400 });
    }
    if (oldUrl === newUrl && (!oldAssetId || oldAssetId === newAssetId)) {
      return NextResponse.json({ error: "oldUrl and newUrl are the same" }, { status: 400 });
    }

    const input: ReplaceInput = {
      oldUrl,
      newUrl,
      oldAssetId: typeof oldAssetId === "string" ? oldAssetId : null,
      newAssetId: typeof newAssetId === "string" ? newAssetId : null,
    };

    const summary = await runReplaceEverywhere(input);
    // Swaps touch landing site_settings rows and partner logos.
    revalidateTag("site-settings", "max");
    revalidateTag("locations", "max");
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
