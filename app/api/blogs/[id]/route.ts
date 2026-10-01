import { after, NextResponse } from "next/server";
import { z } from "zod";
import { blogPostUrls, pingIndexNow } from "@/lib/seo/indexnow";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { touchLastUsed } from "@/lib/media-assets";
import { getAdminBlogPostById, type BlogLocalizedContent } from "@/lib/blogs";
import { isEditorialChange, preserveSeoAnswer } from "@/lib/blog-content-merge";

export const runtime = "nodejs";

const UpdateBlogSchema = z.object({
    slug: z.string().trim().min(1).max(300).optional(),
    status: z.enum(["draft", "published", "unpublished"]).optional(),
    content: z.record(z.string(), z.object({
        title: z.string().min(1),
        sub_header: z.string().optional().default(""),
        description: z.string().optional().default(""),
        body: z.string().optional().default(""),
        seo_keywords: z.array(z.string()).optional().default([]),
        // Answer lede (CONTEXT.md). Optional: omitted on update keeps the stored value.
        seo_answer: z.string().max(1000).optional(),
    })).optional(),
    image_url: z.string().nullable().optional(),
    media_asset_id: z.string().uuid().nullable().optional(),
    author: z.string().optional(),
    published_at: z.string().nullable().optional(),
    labels: z.array(z.string()).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
    const denied = await requireAdmin("blogs");
    if (denied) return denied;

    const { id } = await params;
    const { row, error } = await getAdminBlogPostById(id);
    if (error) return NextResponse.json({ error }, { status: 404 });
    return NextResponse.json({ ok: true, row });
}

export async function PATCH(req: Request, { params }: RouteParams) {
    const denied = await requireAdmin("blogs");
    if (denied) return denied;

    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = UpdateBlogSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updates: Record<string, unknown> = { ...parsed.data };

    if (parsed.data.content) {
        const { data: existing } = await supabaseAdmin()
            .from("blog_posts")
            .select("content")
            .eq("id", id)
            .maybeSingle();
        const before = (existing?.content ?? null) as Record<string, BlogLocalizedContent> | null;
        const content = preserveSeoAnswer(before, parsed.data.content);
        updates.content = content;
        // Only real text edits move Article dateModified (slice 17).
        if (isEditorialChange(before, content)) updates.content_updated_at = new Date().toISOString();
    }

    // Auto-set published_at when publishing for the first time
    if (parsed.data.status === "published" && !parsed.data.published_at) {
        updates.published_at = new Date().toISOString();
    }

    const admin = supabaseAdmin();
    let { data, error } = await admin
        .from("blog_posts")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();
    // Deployed before 20260925130000 is applied: save without the new column rather than fail.
    if (error && "content_updated_at" in updates && /content_updated_at/.test(error.message)) {
        delete updates.content_updated_at;
        ({ data, error } = await admin.from("blog_posts").update(updates).eq("id", id).select("*").single());
    }

    if (error) {
        const isDup = /duplicate key|unique/i.test(error.message);
        return NextResponse.json(
            { error: isDup ? "A post with this slug already exists" : error.message },
            { status: isDup ? 409 : 500 }
        );
    }

    const imageUrl = parsed.data.image_url;
    if (
        (typeof imageUrl === "string" && imageUrl.startsWith("http")) ||
        parsed.data.media_asset_id
    ) {
        await touchLastUsed({
            urls: typeof imageUrl === "string" && imageUrl.startsWith("http") ? [imageUrl] : [],
            assetIds: parsed.data.media_asset_id ? [parsed.data.media_asset_id] : [],
        }).catch(() => {});
    }

    // Published or just unpublished: tell IndexNow engines (Bing → Copilot / ChatGPT search).
    if (data?.slug && (data.status === "published" || parsed.data.status === "unpublished")) {
        after(() => pingIndexNow(blogPostUrls(data.slug as string)));
    }

    return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
    const denied = await requireAdmin("blogs");
    if (denied) return denied;

    const { id } = await params;
    const admin = supabaseAdmin();
    const { error } = await admin.from("blog_posts").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
