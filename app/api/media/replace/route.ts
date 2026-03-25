import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/media/replace
 * Body: { oldUrl: string, newUrl: string }
 *
 * Replaces all references to oldUrl with newUrl across:
 * - blog_posts.image_url (featured images)
 * - blog_posts.content JSONB body fields (inline markdown images)
 * - site_settings.value (landing page slots)
 */
export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { oldUrl, newUrl } = body as { oldUrl?: string; newUrl?: string };

        if (!oldUrl || typeof oldUrl !== "string") {
            return NextResponse.json({ error: "Missing or invalid 'oldUrl'" }, { status: 400 });
        }
        if (!newUrl || typeof newUrl !== "string") {
            return NextResponse.json({ error: "Missing or invalid 'newUrl'" }, { status: 400 });
        }
        if (oldUrl === newUrl) {
            return NextResponse.json({ error: "oldUrl and newUrl are the same" }, { status: 400 });
        }

        const admin = supabaseAdmin();
        const summary = { blogFeatured: 0, blogInline: 0, landingSlots: [] as string[] };

        // 1. Replace blog featured images
        const { data: featuredBlogs, error: featuredErr } = await admin
            .from("blog_posts")
            .select("id")
            .eq("image_url", oldUrl);

        if (featuredErr) {
            return NextResponse.json({ error: featuredErr.message }, { status: 500 });
        }

        if (featuredBlogs && featuredBlogs.length > 0) {
            const ids = featuredBlogs.map((b) => b.id);
            const { error: updateErr } = await admin
                .from("blog_posts")
                .update({ image_url: newUrl, updated_at: new Date().toISOString() })
                .in("id", ids);

            if (updateErr) {
                return NextResponse.json({ error: updateErr.message }, { status: 500 });
            }
            summary.blogFeatured = ids.length;
        }

        // 2. Replace inline images in blog body content
        // Fetch all posts whose content JSON contains the old URL
        const { data: allBlogs, error: allBlogsErr } = await admin
            .from("blog_posts")
            .select("id, content")
            .like("content", `%${oldUrl}%`);

        if (allBlogsErr) {
            return NextResponse.json({ error: allBlogsErr.message }, { status: 500 });
        }

        if (allBlogs && allBlogs.length > 0) {
            for (const blog of allBlogs) {
                const content = blog.content as Record<string, Record<string, string>> | null;
                if (!content) continue;

                let changed = false;
                for (const locale of Object.keys(content)) {
                    const localeData = content[locale];
                    if (localeData?.body && localeData.body.includes(oldUrl)) {
                        localeData.body = localeData.body.replaceAll(oldUrl, newUrl);
                        changed = true;
                    }
                }

                if (changed) {
                    const { error: updateErr } = await admin
                        .from("blog_posts")
                        .update({ content, updated_at: new Date().toISOString() })
                        .eq("id", blog.id);

                    if (updateErr) {
                        return NextResponse.json({ error: updateErr.message }, { status: 500 });
                    }
                    summary.blogInline++;
                }
            }
        }

        // 3. Replace landing page settings
        const { data: settings, error: settingsErr } = await admin
            .from("site_settings")
            .select("key")
            .eq("value", oldUrl)
            .like("key", "landing_%");

        if (settingsErr) {
            return NextResponse.json({ error: settingsErr.message }, { status: 500 });
        }

        if (settings && settings.length > 0) {
            for (const setting of settings) {
                const { error: updateErr } = await admin
                    .from("site_settings")
                    .update({ value: newUrl, updated_at: new Date().toISOString() })
                    .eq("key", setting.key);

                if (updateErr) {
                    return NextResponse.json({ error: updateErr.message }, { status: 500 });
                }
                summary.landingSlots.push(setting.key);
            }
        }

        return NextResponse.json({ ok: true, summary });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 }
        );
    }
}
