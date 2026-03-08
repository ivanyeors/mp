import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
    const admin = supabaseAdmin();
    const { data, error } = await admin.storage.from("media").list("", {
        sortBy: { column: "created_at", order: "desc" },
    });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Filter out the empty folder placeholder, create full URLs
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
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;

        // Upload file
        const { error: uploadError } = await admin.storage
            .from("media")
            .upload(fileName, file, {
                cacheControl: "3600",
                upsert: false,
            });

        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: publicUrlData } = admin.storage.from("media").getPublicUrl(fileName);

        return NextResponse.json({
            ok: true,
            file: { name: fileName, url: publicUrlData.publicUrl },
        });
    } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
