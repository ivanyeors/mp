"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Save, ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { usePathname } from "next/navigation";

type LocaleContent = {
    title: string;
    sub_header: string;
    description: string;
    body: string;
    seo_keywords: string[];
};

const emptyContent = (): LocaleContent => ({
    title: "",
    sub_header: "",
    description: "",
    body: "",
    seo_keywords: [],
});

export default function BlogEditorPage() {
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);

    const isNew = params.id === "new";
    const postId = isNew ? null : (params.id as string);

    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);

    // Form state
    const [slug, setSlug] = useState("");
    const [status, setStatus] = useState<string>("draft");
    const [author, setAuthor] = useState("Mpillow");
    const [imageUrl, setImageUrl] = useState("");
    const [content, setContent] = useState<Record<string, LocaleContent>>({
        "en-US": emptyContent(),
        "zh-CN": emptyContent(),
    });

    // Language toggle
    const [activeLocale, setActiveLocale] = useState<Locale>("en-US");
    const activeContent = content[activeLocale] ?? emptyContent();

    const updateActiveContent = (field: keyof LocaleContent, value: string | string[]) => {
        setContent((prev) => ({
            ...prev,
            [activeLocale]: { ...prev[activeLocale], [field]: value },
        }));
    };

    // Auto-generate slug from title
    const generateSlug = (title: string) =>
        title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .slice(0, 200);

    // Load existing post
    const loadPost = useCallback(async () => {
        if (!postId) return;
        setLoading(true);
        const res = await fetch(`/api/blogs/${postId}`);
        const json = await res.json();
        if (json.ok && json.row) {
            const row = json.row;
            setSlug(row.slug);
            setStatus(row.status);
            setAuthor(row.author);
            setImageUrl(row.image_url ?? "");
            // Merge existing content with empty defaults
            const merged: Record<string, LocaleContent> = {};
            for (const loc of SUPPORTED_LOCALES) {
                merged[loc] = { ...emptyContent(), ...(row.content?.[loc] ?? {}) };
            }
            setContent(merged);
        }
        setLoading(false);
    }, [postId]);

    useEffect(() => { loadPost(); }, [loadPost]);

    const handleSave = async (publishOverride?: string) => {
        setSaving(true);
        const payload = {
            slug,
            status: publishOverride ?? status,
            author,
            image_url: imageUrl || null,
            content,
        };

        try {
            if (isNew) {
                const res = await fetch("/api/blogs", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (json.ok && json.row) {
                    router.push(to(`/settings/blogs/${json.row.id}`));
                } else {
                    alert(json.error ?? "Failed to create post.");
                }
            } else {
                const res = await fetch(`/api/blogs/${postId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!json.ok) alert(json.error ?? "Failed to save.");
                else loadPost();
            }
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button asChild variant="ghost" size="icon">
                        <Link href={to("/settings/blogs")}>
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <h1>{isNew ? "New Blog Post" : "Edit Blog Post"}</h1>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleSave()} disabled={saving}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save
                    </Button>
                    <Button size="sm" onClick={() => handleSave("published")} disabled={saving}>
                        <Eye className="mr-2 h-4 w-4" /> Save &amp; Publish
                    </Button>
                </div>
            </div>

            {/* Language Toggle */}
            <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
                {SUPPORTED_LOCALES.map((loc) => (
                    <button
                        key={loc}
                        type="button"
                        onClick={() => setActiveLocale(loc)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${activeLocale === loc
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                    >
                        {loc === "en-US" ? "🇺🇸 English" : "🇨🇳 中文"}
                    </button>
                ))}
            </div>

            {/* Form Fields */}
            <div className="space-y-5">
                {/* Slug */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Slug</label>
                    <input
                        type="text"
                        value={slug}
                        onChange={(e) => setSlug(e.target.value)}
                        placeholder="my-blog-post-url"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {activeContent.title && (
                        <button
                            type="button"
                            className="text-xs text-primary hover:underline"
                            onClick={() => setSlug(generateSlug(activeContent.title))}
                        >
                            Auto-generate from title
                        </button>
                    )}
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Title ({activeLocale})</label>
                    <input
                        type="text"
                        value={activeContent.title}
                        onChange={(e) => updateActiveContent("title", e.target.value)}
                        placeholder="Blog post title"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>

                {/* Sub-header */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Sub-header ({activeLocale})</label>
                    <input
                        type="text"
                        value={activeContent.sub_header}
                        onChange={(e) => updateActiveContent("sub_header", e.target.value)}
                        placeholder="A subtitle or tagline"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>

                {/* SEO Description */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">SEO Description ({activeLocale})</label>
                    <textarea
                        value={activeContent.description}
                        onChange={(e) => updateActiveContent("description", e.target.value)}
                        placeholder="Meta description for search engines and AI answer engines"
                        rows={2}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                </div>

                {/* SEO Keywords */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">SEO Keywords ({activeLocale})</label>
                    <input
                        type="text"
                        value={(activeContent.seo_keywords ?? []).join(", ")}
                        onChange={(e) =>
                            updateActiveContent(
                                "seo_keywords",
                                e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                            )
                        }
                        placeholder="keyword1, keyword2, keyword3"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated list</p>
                </div>

                {/* Body (Rich Text / Markdown) */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Content Body ({activeLocale})</label>
                    <textarea
                        value={activeContent.body}
                        onChange={(e) => updateActiveContent("body", e.target.value)}
                        placeholder="Write your blog content in Markdown..."
                        rows={20}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                    />
                    <p className="text-xs text-muted-foreground">Supports Markdown formatting</p>
                </div>

                <hr />

                {/* Shared fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Author</label>
                        <input
                            type="text"
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="unpublished">Unpublished</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Hero Image URL</label>
                    <input
                        type="text"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="https://... or /images/blogs/..."
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
            </div>
        </div>
    );
}
