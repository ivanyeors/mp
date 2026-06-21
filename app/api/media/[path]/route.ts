import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

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

    // Check usage before deleting (unless force=true)
    if (!force) {
        const { data: publicUrlData } = admin.storage.from("media").getPublicUrl(path);
        const fileUrl = publicUrlData.publicUrl;

        const usages = await getImageUsages(admin, fileUrl);
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

/** Check where an image URL is referenced. */
async function getImageUsages(
    admin: ReturnType<typeof supabaseAdmin>,
    url: string
): Promise<Array<{ type: string; label: string; ref_id: string }>> {
    const usages: Array<{ type: string; label: string; ref_id: string }> = [];

    const [blogsResult, settingsResult] = await Promise.all([
        admin.from("blog_posts").select("id, slug, image_url, content"),
        admin.from("site_settings").select("key, value").like("key", "landing_%"),
    ]);

    const blogs = blogsResult.data ?? [];
    const settings = settingsResult.data ?? [];

    // Check blog featured images
    for (const blog of blogs) {
        if (blog.image_url === url) {
            const title = getBlogTitle(blog.content);
            usages.push({ type: "blog_featured", label: title || blog.slug, ref_id: blog.id });
        }
    }

    // Check blog inline images
    for (const blog of blogs) {
        const content = blog.content as Record<string, { body?: string }> | null;
        if (!content) continue;
        for (const locale of Object.values(content)) {
            if (locale?.body?.includes(url)) {
                const title = getBlogTitle(blog.content);
                usages.push({ type: "blog_inline", label: title || blog.slug, ref_id: blog.id });
                break;
            }
        }
    }

    // Check landing page settings
    for (const setting of settings) {
        if (setting.value === url) {
            const slotLabels: Record<string, string> = {
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
            usages.push({
                type: "landing_slot",
                label: slotLabels[setting.key] ?? setting.key,
                ref_id: setting.key,
            });
        }
    }

    return usages;
}

function getBlogTitle(content: unknown): string {
    if (!content || typeof content !== "object") return "";
    const locales = Object.values(content as Record<string, { title?: string }>);
    for (const loc of locales) {
        if (loc?.title) return loc.title;
    }
    return "";
}
