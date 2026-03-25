import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Where an image is referenced. */
export type UsageEntry = {
    type: "blog_featured" | "blog_inline" | "landing_slot";
    label: string;
    ref_id: string;
};

/** Landing-slot key → human-readable label */
const SLOT_LABELS: Record<string, string> = {
    landing_hero: "Hero",
    landing_size_matters: "Size Matters",
    landing_marquee: "Marquee",
    landing_ambassadors: "Ambassadors",
    landing_cervical_neck: "Cervical Neck",
    landing_basic_pillow: "Basic Pillow",
    landing_premium_pillow: "Premium Pillow",
    landing_mbolster: "Mbolster",
    landing_founder: "Founder",
};

/**
 * GET /api/media/usage
 *
 * Returns a map of image URL → UsageEntry[].
 * Optional `?url=<url>` to filter to a single image.
 */
export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const filterUrl = searchParams.get("url");

        const admin = supabaseAdmin();

        // Fetch blog posts and landing-page settings in parallel
        const [blogsResult, settingsResult] = await Promise.all([
            admin.from("blog_posts").select("id, slug, image_url, content"),
            admin.from("site_settings").select("key, value").like("key", "landing_%"),
        ]);

        if (blogsResult.error) {
            return NextResponse.json({ error: blogsResult.error.message }, { status: 500 });
        }
        if (settingsResult.error) {
            return NextResponse.json({ error: settingsResult.error.message }, { status: 500 });
        }

        const blogs = blogsResult.data ?? [];
        const settings = settingsResult.data ?? [];

        const usageMap: Record<string, UsageEntry[]> = {};

        const addUsage = (url: string, entry: UsageEntry) => {
            if (!usageMap[url]) usageMap[url] = [];
            usageMap[url].push(entry);
        };

        // Scan blog featured images
        for (const blog of blogs) {
            if (blog.image_url) {
                if (!filterUrl || blog.image_url === filterUrl) {
                    const title = getBlogTitle(blog.content);
                    addUsage(blog.image_url, {
                        type: "blog_featured",
                        label: title || blog.slug,
                        ref_id: blog.id,
                    });
                }
            }
        }

        // Scan blog body content for inline image URLs
        for (const blog of blogs) {
            const content = blog.content as Record<string, { body?: string }> | null;
            if (!content) continue;

            for (const locale of Object.values(content)) {
                if (!locale?.body) continue;

                if (filterUrl) {
                    // Check only the specific URL
                    if (locale.body.includes(filterUrl)) {
                        const title = getBlogTitle(blog.content);
                        addUsage(filterUrl, {
                            type: "blog_inline",
                            label: title || blog.slug,
                            ref_id: blog.id,
                        });
                        break; // One entry per blog post is enough
                    }
                } else {
                    // Extract all image URLs from markdown
                    const imgUrls = extractMarkdownImageUrls(locale.body);
                    for (const imgUrl of imgUrls) {
                        // Skip if this URL is already tracked as featured for this blog
                        if (imgUrl === blog.image_url) continue;
                        const title = getBlogTitle(blog.content);
                        addUsage(imgUrl, {
                            type: "blog_inline",
                            label: title || blog.slug,
                            ref_id: blog.id,
                        });
                    }
                }
            }
        }

        // Scan landing page settings
        for (const setting of settings) {
            if (!filterUrl || setting.value === filterUrl) {
                addUsage(setting.value, {
                    type: "landing_slot",
                    label: SLOT_LABELS[setting.key] ?? setting.key,
                    ref_id: setting.key,
                });
            }
        }

        return NextResponse.json({ ok: true, usages: usageMap });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Unknown error" },
            { status: 500 }
        );
    }
}

/** Extract the first available title from blog JSONB content. */
function getBlogTitle(content: unknown): string {
    if (!content || typeof content !== "object") return "";
    const locales = Object.values(content as Record<string, { title?: string }>);
    for (const loc of locales) {
        if (loc?.title) return loc.title;
    }
    return "";
}

/** Extract image URLs from markdown `![alt](url)` and HTML `<img src="url">` patterns. */
function extractMarkdownImageUrls(body: string): string[] {
    const urls = new Set<string>();
    // Markdown images: ![alt](url)
    const mdRegex = /!\[[^\]]*\]\(([^)]+)\)/g;
    let match;
    while ((match = mdRegex.exec(body)) !== null) {
        urls.add(match[1]);
    }
    // HTML img tags: <img ... src="url" ...>
    const htmlRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    while ((match = htmlRegex.exec(body)) !== null) {
        urls.add(match[1]);
    }
    return Array.from(urls);
}
