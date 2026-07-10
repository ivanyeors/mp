import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { listMediaAssets } from "@/lib/media-assets";
import { ingestImageAsset } from "@/lib/media-assets/ingest";

export const runtime = "nodejs";

export async function GET() {
    const denied = await requireAdmin("media");
    if (denied) return denied;

    // Prefer Asset registry; fall back to bucket list if registry empty (pre-backfill).
    try {
        const assets = await listMediaAssets();
        if (assets.length > 0) {
            const files = assets
                .filter((a) => a.hosted_url)
                .map((a) => ({
                    id: a.id,
                    name: a.name,
                    url: a.hosted_url!,
                    created_at: a.created_at,
                }));
            return NextResponse.json({ ok: true, files });
        }
    } catch {
        // fall through to storage list
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin.storage.from("media").list("", {
        sortBy: { column: "created_at", order: "desc" },
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const files = data
        .filter((file) => file.name !== ".emptyFolderPlaceholder")
        .map((file) => {
            const { data: publicUrlData } = admin.storage.from("media").getPublicUrl(file.name);
            return {
                ...file,
                url: publicUrlData.publicUrl,
            };
        });

    return NextResponse.json({ ok: true, files });
}

export async function POST(req: Request) {
    const denied = await requireAdmin("media");
    if (denied) return denied;

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }
        if (!file.type.startsWith("image/")) {
            return NextResponse.json({ error: "Only image uploads are supported" }, { status: 400 });
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const { asset, storagePath } = await ingestImageAsset({
            bytes,
            originalName: file.name,
        });

        return NextResponse.json({
            ok: true,
            file: {
                name: storagePath,
                url: asset.hosted_url,
                id: asset.id,
            },
            asset,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}
