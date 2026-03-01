import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

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
    })).optional(),
    image_url: z.string().nullable().optional(),
    author: z.string().optional(),
    published_at: z.string().nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
    const { id } = await params;
    const admin = supabaseAdmin();
    const { data, error } = await admin.from("blog_posts").select("*").eq("id", id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ ok: true, row: data });
}

export async function PATCH(req: Request, { params }: RouteParams) {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = UpdateBlogSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const updates: Record<string, unknown> = { ...parsed.data };

    // Auto-set published_at when publishing for the first time
    if (parsed.data.status === "published" && !parsed.data.published_at) {
        updates.published_at = new Date().toISOString();
    }

    const admin = supabaseAdmin();
    const { data, error } = await admin
        .from("blog_posts")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single();

    if (error) {
        const isDup = /duplicate key|unique/i.test(error.message);
        return NextResponse.json(
            { error: isDup ? "A post with this slug already exists" : error.message },
            { status: isDup ? 409 : 500 }
        );
    }
    return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
    const { id } = await params;
    const admin = supabaseAdmin();
    const { error } = await admin.from("blog_posts").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
}
