import { after, NextResponse } from "next/server";
import { blogPostUrls, pingIndexNow } from "@/lib/seo/indexnow";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";
import { listAdminBlogPosts } from "@/lib/blogs";
import { blogInputError, CreateBlogSchema } from "@/lib/blog-post-input";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const denied = await requireAdmin("blogs");
    if (denied) return denied;

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
        return NextResponse.json({ error: blogInputError(parsed.error) }, { status: 400 });
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

    if (data?.slug && data.status === "published") {
        after(() => pingIndexNow(blogPostUrls(data.slug as string)));
    }

    const imageUrl = parsed.data.image_url;
    await touchLastUsed({
        urls: typeof imageUrl === "string" && imageUrl.startsWith("http") ? [imageUrl] : [],
        assetIds: parsed.data.media_asset_id ? [parsed.data.media_asset_id] : [],
    }).catch(() => {});

    return NextResponse.json({ ok: true, row: data });
}
