import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { deleteMediaAssetGuarded, MediaAssetInUseError } from "@/lib/media-assets";
import { EMAIL_RENDITION_FOLDER } from "@/lib/media-assets/email-renditions";
import { listImageUsages } from "@/lib/media/image-usages";

export const runtime = "nodejs";

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ path: string }> }
) {
    const denied = await requireAdmin("media");
    if (denied) return denied;

    const { path } = await params;
    if (!path) {
        return NextResponse.json({ error: "No file path provided" }, { status: 400 });
    }
    // An email rendition is never deleted: a sent email points at it for good.
    if (path.startsWith(`${EMAIL_RENDITION_FOLDER}/`)) {
        return NextResponse.json({ error: "An email copy stays for the emails that show it." }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const admin = supabaseAdmin();
    const { data: publicUrlData } = admin.storage.from("media").getPublicUrl(path);
    const fileUrl = publicUrlData.publicUrl;

    // A file the Asset registry knows goes through its guarded delete, which
    // also counts the uses by Asset id (an email campaign's) and refuses those.
    const { data: asset } = await admin.from("media_assets").select("id").eq("hosted_url", fileUrl).maybeSingle();
    if (asset) {
        try {
            await deleteMediaAssetGuarded(asset.id as string, { force });
            return NextResponse.json({ ok: true });
        } catch (err) {
            if (err instanceof MediaAssetInUseError) {
                return NextResponse.json(
                    { error: "Image is in use", usages: err.usages, deletable: err.deletable },
                    { status: 409 }
                );
            }
            return NextResponse.json({ error: err instanceof Error ? err.message : "Delete failed" }, { status: 500 });
        }
    }

    // Check usage before deleting (unless force=true)
    if (!force) {
        const usages = await listImageUsages(fileUrl);
        if (usages.length > 0) {
            return NextResponse.json(
                { error: "Image is in use", usages },
                { status: 409 }
            );
        }
    }

    const { error } = await admin.storage.from("media").remove([path]);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
