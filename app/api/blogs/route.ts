import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";
import { listAdminBlogPosts } from "@/lib/blogs";

export const runtime = "nodejs";

const CreateBlogSchema = z.object({
    slug: z.string().trim().min(1).max(300),
    status: z.enum(["draft", "published", "unpublished"]).default("draft"),
    content: z.record(z.string(), z.object({
        title: z.string().min(1),
        sub_header: z.string().optional().default(""),
        description: z.string().optional().default(""),
        body: z.string().optional().default(""),
        seo_keywords: z.array(z.string()).optional().default([]),
    })).default({}),
    image_url: z.string().nullable().optional().default(null),
    media_asset_id: z.string().uuid().nullable().optional().default(null),
    author: z.string().optional().default("Mpillow"),
    published_at: z.string().nullable().optional().default(null),
    labels: z.array(z.string()).optional().default([]),
});

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    try {
        return NextResponse.json({ ok: true, rows: await listAdminBlogPosts(status) });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 },
        );
    }
}

export async function POST(req: Request) {
    const denied = await requireAdmin("blogs");
    if (denied) return denied;

    const body = await req.json().catch(() => null);
    const parsed = CreateBlogSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const admin = supabaseAdmin();
    const row: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === "published" && !parsed.data.published_at) {
        row.published_at = new Date().toISOString();
    }

    const { data, error } = await admin.from("blog_posts").insert(row).select("*").single();
    if (error) {
        const isDup = /duplicate key|unique/i.test(error.message);
        return NextResponse.json(
            { error: isDup ? "A post with this slug already exists" : error.message },
            { status: isDup ? 409 : 500 }
        );
    }

    const imageUrl = parsed.data.image_url;
    await touchLastUsed({
        urls: typeof imageUrl === "string" && imageUrl.startsWith("http") ? [imageUrl] : [],
        assetIds: parsed.data.media_asset_id ? [parsed.data.media_asset_id] : [],
    }).catch(() => {});

    return NextResponse.json({ ok: true, row: data });
}
