import { z } from "zod";

export const BLOG_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const BLOG_SLUG_MESSAGE =
    "Give the post a slug made of lowercase letters, numbers and hyphens, like my-blog-post.";

export const trimSlugHyphens = (slug: string) => slug.replace(/^-+|-+$/g, "");

export const blogSlugWhileTyping = (text: string) =>
    text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 200);

export const blogSlug = (text: string) => trimSlugHyphens(blogSlugWhileTyping(text));

const BLOG_LOCALE_LABELS: Record<string, string> = { "en-US": "English", "zh-CN": "中文" };

const TEXT_FIELDS = ["title", "sub_header", "description", "body", "seo_answer"] as const;

function isBlankLocale(loc: unknown): boolean {
    if (!loc || typeof loc !== "object" || Array.isArray(loc)) return false;
    const fields = loc as Record<string, unknown>;
    const noText = TEXT_FIELDS.every((f) => typeof fields[f] !== "string" || !fields[f].trim());
    const noKeywords = !Array.isArray(fields.seo_keywords) || fields.seo_keywords.length === 0;
    return noText && noKeywords;
}

export function dropBlankLocales(content: unknown): unknown {
    if (!content || typeof content !== "object" || Array.isArray(content)) return content;
    return Object.fromEntries(Object.entries(content).filter(([, loc]) => !isBlankLocale(loc)));
}

const LocaleContentSchema = z.object({
    title: z.string().refine((title) => title.trim().length > 0),
    sub_header: z.string().optional().default(""),
    description: z.string().optional().default(""),
    body: z.string().optional().default(""),
    seo_keywords: z.array(z.string()).optional().default([]),
    seo_answer: z.string().max(1000).optional(),
});

const BlogContentSchema = z.preprocess(
    dropBlankLocales,
    z
        .record(z.string(), LocaleContentSchema)
        .refine((content) => Object.keys(content).length > 0, "Add a title before saving."),
);

const STATUS = z.enum(["draft", "published", "unpublished"]);

export const CreateBlogSchema = z.object({
    slug: z.string().trim().max(300).regex(BLOG_SLUG_PATTERN, BLOG_SLUG_MESSAGE),
    status: STATUS.default("draft"),
    content: BlogContentSchema,
    image_url: z.string().nullable().optional().default(null),
    media_asset_id: z.string().uuid().nullable().optional().default(null),
    author: z.string().optional().default("Mpillow"),
    published_at: z.string().nullable().optional().default(null),
    labels: z.array(z.string()).optional().default([]),
});

export const UpdateBlogSchema = z.object({
    slug: z.string().trim().min(1, BLOG_SLUG_MESSAGE).max(300).optional(),
    status: STATUS.optional(),
    content: BlogContentSchema.optional(),
    image_url: z.string().nullable().optional(),
    media_asset_id: z.string().uuid().nullable().optional(),
    author: z.string().optional(),
    published_at: z.string().nullable().optional(),
    labels: z.array(z.string()).optional(),
});

export function blogInputError(error: z.ZodError): string {
    const issue = error.issues[0];
    if (!issue) return "Couldn't save the post.";
    const [field, locale, localeField] = issue.path;
    if (field === "content" && typeof locale === "string" && localeField === "title") {
        const tab = BLOG_LOCALE_LABELS[locale] ?? locale;
        return `The ${tab} tab has text but no title. Add a title there, or clear that tab.`;
    }
    if (field === "slug" || (field === "content" && issue.path.length === 1 && issue.code === "custom")) {
        return issue.message;
    }
    return `${issue.path.join(".") || "Post"}: ${issue.message}`;
}

export function errorText(error: unknown, fallback: string): string {
    return typeof error === "string" && error.trim() ? error : fallback;
}
