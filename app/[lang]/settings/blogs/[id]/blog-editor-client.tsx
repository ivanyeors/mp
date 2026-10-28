"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, Save, ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageActions, pageActionClassName } from "@/components/ui/page-actions";
import { useMobileDockActions } from "@/components/ui/page-dock-actions";
import { ImagePicker } from "@/components/ui/image-picker";
import Link from "next/link";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { useSettingsBreadcrumbDetail } from "@/components/settings/settings-breadcrumb-context";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { MAX_META_DESCRIPTION_CHARS } from "@/lib/seo/meta-description";
import {
    bold,
    italic,
    title,
    link,
    quote,
    unorderedListCommand,
    orderedListCommand,
    type ICommand,
} from "@uiw/react-md-editor/commands";
import { rehypeStripUnsafeHtml } from "@/lib/blog-editor/strip-unsafe-html";

const MDEditor = dynamic(
    () => import("@uiw/react-md-editor").then((mod) => mod.default),
    { ssr: false }
);

// The preview parses raw HTML; strip anything that could run script in the
// Admin Panel (public posts never render raw HTML at all).
const PREVIEW_OPTIONS = { rehypePlugins: [rehypeStripUnsafeHtml] };

// ponytail: reduced toolbar so it fits a phone without horizontal overflow
const MOBILE_MD_COMMANDS: ICommand[] = [
    bold,
    italic,
    title,
    link,
    quote,
    unorderedListCommand,
    orderedListCommand,
];

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

/** Merge a stored `content` map onto empty defaults for every locale. */
const mergeContent = (
    raw?: Record<string, Partial<LocaleContent>> | null,
): Record<string, LocaleContent> => {
    const merged: Record<string, LocaleContent> = {};
    for (const loc of SUPPORTED_LOCALES) {
        merged[loc] = { ...emptyContent(), ...(raw?.[loc] ?? {}) };
    }
    return merged;
};

/** The `blog_posts` row `/api/blogs/[id]` returns. */
export type BlogEditorRow = {
    slug: string;
    status: string;
    author: string;
    image_url: string | null;
    media_asset_id?: string | null;
    labels?: string[] | null;
    content?: Record<string, Partial<LocaleContent>> | null;
};

/** The `/api/blogs/[id]` payload the editor mounts with (absent for a new post). */
export type BlogEditorInitialData = { ok: true; row: BlogEditorRow };

export default function BlogEditorPage({
    initialData,
}: {
    initialData?: BlogEditorInitialData;
}) {
    const params = useParams();
    const router = useRouter();
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const { resolvedTheme } = useTheme();
    const isMobile = useIsMobile();

    const isNew = params.id === "new";
    const postId = isNew ? null : (params.id as string);

    const initialRow = initialData?.row ?? null;

    const [loading, setLoading] = useState(!isNew && !initialData);
    const [saving, setSaving] = useState(false);
    // The server already loaded the post; only later saves refetch it.
    const skipFirstFetch = useRef(initialData != null);

    // Form state
    const [slug, setSlug] = useState(initialRow?.slug ?? "");
    const [status, setStatus] = useState<string>(initialRow?.status ?? "draft");
    const [author, setAuthor] = useState(initialRow?.author ?? "Mpillow");
    const [imageUrl, setImageUrl] = useState(initialRow?.image_url ?? "");
    const [imageAssetId, setImageAssetId] = useState<string | null>(
        initialRow?.media_asset_id ?? null,
    );
    const [labels, setLabels] = useState<string[]>(initialRow?.labels ?? []);
    const [content, setContent] = useState<Record<string, LocaleContent>>(() =>
        mergeContent(initialRow?.content),
    );

    // Language toggle
    const [activeLocale, setActiveLocale] = useState<Locale>("en-US");
    const activeContent = content[activeLocale] ?? emptyContent();

    useSettingsBreadcrumbDetail(
        isNew ? "New post" : (content["en-US"]?.title?.trim() || null),
    );

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
            setImageAssetId(row.media_asset_id ?? null);
            setLabels(row.labels ?? []);
            // Merge existing content with empty defaults
            setContent(mergeContent(row.content));
        }
        setLoading(false);
    }, [postId]);

    useEffect(() => {
        if (skipFirstFetch.current) {
            skipFirstFetch.current = false;
            return;
        }
        loadPost();
    }, [loadPost]);

    const handleSave = async (publishOverride?: string) => {
        setSaving(true);
        const payload = {
            slug,
            status: publishOverride ?? status,
            author,
            image_url: imageUrl || null,
            media_asset_id: imageAssetId,
            labels,
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
                    alert(json.error ?? "Couldn't create the post.");
                }
            } else {
                const res = await fetch(`/api/blogs/${postId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                const json = await res.json();
                if (!json.ok) alert(json.error ?? "Couldn't save.");
                else loadPost();
            }
        } finally {
            setSaving(false);
        }
    };

    // Phones: the header cluster moves into the bottom dock, within thumb reach.
    useMobileDockActions([
        { id: "save", title: saving ? "Saving…" : "Save", icon: Save, onClick: () => void handleSave() },
        { id: "publish", title: "Save and publish", icon: Eye, onClick: () => void handleSave("published") },
    ]);

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
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    {/* The shell breadcrumb already links back on a phone. */}
                    <Button asChild variant="ghost" size="icon" className="min-h-11 min-w-11 shrink-0 max-md:hidden">
                        <Link href={to("/settings/blogs")} aria-label="Back to Blogs">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <h1 className="truncate">{isNew ? "New blog post" : "Edit blog post"}</h1>
                </div>
                <PageActions docked>
                    <Button
                        variant="outline"
                        size="sm"
                        className={pageActionClassName}
                        onClick={() => handleSave()}
                        disabled={saving}
                    >
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save
                    </Button>
                    <Button
                        size="sm"
                        className={pageActionClassName}
                        onClick={() => handleSave("published")}
                        disabled={saving}
                    >
                        <Eye className="mr-2 h-4 w-4" /> Save and publish
                    </Button>
                </PageActions>
            </div>

            {/* Language Toggle */}
            <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
                {SUPPORTED_LOCALES.map((loc) => (
                    <button
                        key={loc}
                        type="button"
                        onClick={() => setActiveLocale(loc)}
                        className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors max-md:min-h-11 ${activeLocale === loc
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-press"
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
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {activeContent.title && (
                        <button
                            type="button"
                            className="text-xs text-primary hover:underline active:opacity-60 max-md:inline-flex max-md:min-h-11 max-md:items-center"
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
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
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
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>

                {/* SEO Description */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">SEO description ({activeLocale})</label>
                    <textarea
                        value={activeContent.description}
                        onChange={(e) => updateActiveContent("description", e.target.value)}
                        placeholder="Meta description for search engines and AI answer engines"
                        rows={2}
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                    <p
                        className={`text-xs ${activeContent.description.length > MAX_META_DESCRIPTION_CHARS ? "text-destructive" : "text-muted-foreground"}`}
                    >
                        {activeContent.description.length}/{MAX_META_DESCRIPTION_CHARS}
                        {activeContent.description.trim()
                            ? activeContent.description.length > MAX_META_DESCRIPTION_CHARS
                                ? " (too long, so search results cut it off)"
                                : ""
                            : " (empty, so search results show the start of the post)"}
                    </p>
                </div>

                {/* SEO Keywords */}
                <div className="space-y-1.5">
                    <label className="text-sm font-medium">SEO keywords ({activeLocale})</label>
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
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated list</p>
                </div>

                {/* Body (Rich Text / Markdown) */}
                <div className="space-y-1.5" data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}>
                    <label className="text-sm font-medium">Body ({activeLocale})</label>
                    <MDEditor
                        value={activeContent.body}
                        onChange={(val) => updateActiveContent("body", val || "")}
                        height={isMobile ? "60dvh" : 500}
                        preview="edit"
                        previewOptions={PREVIEW_OPTIONS}
                        commands={isMobile ? MOBILE_MD_COMMANDS : undefined}
                        className="w-full rounded-lg border focus-within:ring-2 focus-within:ring-primary overflow-hidden"
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
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="unpublished">Unpublished</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Hero image URL</label>
                    {/* Wraps at 360px, where Browse Media would otherwise be cut. */}
                    <div className="flex flex-wrap gap-2">
                        <input
                            type="text"
                            value={imageUrl}
                            onChange={(e) => {
                                setImageUrl(e.target.value);
                                setImageAssetId(null);
                            }}
                            placeholder="https://… or /images/blogs/…"
                            className="min-w-48 flex-1 rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <ImagePicker
                            onSelect={(s) => {
                                setImageUrl(s.url);
                                setImageAssetId(s.assetId);
                            }}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium">Global labels</label>
                    <input
                        type="text"
                        value={labels.join(", ")}
                        onChange={(e) =>
                            setLabels(
                                e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                            )
                        }
                        placeholder="sleep, posture, guide"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-sm max-md:text-base max-md:min-h-11 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <p className="text-xs text-muted-foreground">Comma-separated list</p>
                </div>
            </div>
        </div>
    );
}
