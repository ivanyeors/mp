import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ path: string }> }
) {
    const { path } = await params;
    if (!path) {
        return NextResponse.json({ error: "No file path provided" }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const { error } = await admin.storage.from("media").remove([path]);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
