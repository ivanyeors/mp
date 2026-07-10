import { supabaseAdmin } from "@/lib/supabase/server";

export type ImageUsageEntry = {
  type: "blog_featured" | "blog_inline" | "landing_slot";
  label: string;
  ref_id: string;
};

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

function getBlogTitle(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const locales = Object.values(content as Record<string, { title?: string }>);
  for (const loc of locales) {
    if (loc?.title) return loc.title;
  }
  return "";
}

/** Where a hosted image URL is attached (blogs + landing slots). Slice 10 expands scanners. */
export async function listImageUsages(url: string): Promise<ImageUsageEntry[]> {
  const admin = supabaseAdmin();
  const usages: ImageUsageEntry[] = [];

  const [blogsResult, settingsResult] = await Promise.all([
    admin.from("blog_posts").select("id, slug, image_url, content"),
    admin.from("site_settings").select("key, value").like("key", "landing_%"),
  ]);

  for (const blog of blogsResult.data ?? []) {
    if (blog.image_url === url) {
      usages.push({
        type: "blog_featured",
        label: getBlogTitle(blog.content) || blog.slug,
        ref_id: blog.id,
      });
    }
  }

  for (const blog of blogsResult.data ?? []) {
    const content = blog.content as Record<string, { body?: string }> | null;
    if (!content) continue;
    for (const locale of Object.values(content)) {
      if (locale?.body?.includes(url)) {
        usages.push({
          type: "blog_inline",
          label: getBlogTitle(blog.content) || blog.slug,
          ref_id: blog.id,
        });
        break;
      }
    }
  }

  for (const setting of settingsResult.data ?? []) {
    if (setting.value === url) {
      usages.push({
        type: "landing_slot",
        label: SLOT_LABELS[setting.key] ?? setting.key,
        ref_id: setting.key,
      });
    }
  }

  return usages;
}
