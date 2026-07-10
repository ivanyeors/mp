import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
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

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const admin = supabaseAdmin();
    const { data: publicUrlData } = admin.storage.from("media").getPublicUrl(path);
    const fileUrl = publicUrlData.publicUrl;

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

    // Keep Asset registry in sync with bucket deletes
    await admin.from("media_assets").delete().eq("hosted_url", fileUrl);

    return NextResponse.json({ ok: true });
}
