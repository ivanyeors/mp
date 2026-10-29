"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Trash2, Pencil, Eye, EyeOff, Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/settings/empty-state";
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatAdminDate } from "@/lib/format/admin-date";
import { InfoTip } from "@/components/ui/info-tip";

export type BlogRow = {
    id: string;
    slug: string;
    status: string;
    content: Record<string, { title: string; description?: string }>;
    image_url: string | null;
    author: string;
    published_at: string | null;
    created_at: string;
};

/** The `/api/blogs` payload the list mounts with. */
export type BlogsInitialData = { ok: true; rows: BlogRow[] };

export default function SettingsBlogsPage({ initialData }: { initialData?: BlogsInitialData }) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);

    const [posts, setPosts] = useState<BlogRow[]>(initialData?.rows ?? []);
    const [loading, setLoading] = useState(!initialData);
    // The server already loaded the first page of rows; later calls still fetch.
    const skipFirstFetch = useRef(initialData != null);


    const fetchPosts = useCallback(async () => {
        setLoading(true);
        const res = await fetch("/api/blogs");
        const json = await res.json();
        setPosts(json.rows ?? []);
        setLoading(false);
    }, []);

    useEffect(() => {
        if (skipFirstFetch.current) {
            skipFirstFetch.current = false;
            return;
        }
        fetchPosts();
    }, [fetchPosts]);

    const toggleStatus = async (id: string, currentStatus: string) => {
        const newStatus = currentStatus === "published" ? "unpublished" : "published";
        await fetch(`/api/blogs/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        });
        fetchPosts();
    };

    const deletePost = async (id: string) => {
        if (!confirm("Delete this blog post?")) return;
        await fetch(`/api/blogs/${id}`, { method: "DELETE" });
        fetchPosts();
    };



    const getTitle = (row: BlogRow) => {
        const loc = row.content?.["en-US"] ?? Object.values(row.content ?? {})[0];
        return loc?.title ?? row.slug;
    };

    const statusBadge = (status: string) => {
        const colors: Record<string, string> = {
            published: "bg-green-500/15 text-green-700 dark:text-green-400",
            draft: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
            unpublished: "bg-red-500/15 text-red-700 dark:text-red-400",
        };
        return (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colors[status] ?? "bg-muted text-muted-foreground"}`}>
                {status}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5">
                      <h1>Blogs</h1>
                      <InfoTip label="About Blogs">
                        <p>Create, edit, and publish blog posts.</p>
                      </InfoTip>
                    </div>
                </div>
                <Button asChild size="sm">
                    <Link href={to("/settings/blogs/new")}>
                        <Plus className="mr-2 h-4 w-4" /> New post
                    </Link>
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : posts.length === 0 ? (
                <EmptyState>No blog posts yet.</EmptyState>
            ) : (
                <>
                    {/* Phones: the row opens the editor; publish and delete sit in one menu. */}
                    <MobileList>
                        {posts.map((post) => (
                            <MobileListRow
                                key={post.id}
                                href={to(`/settings/blogs/${post.id}`)}
                                actions={
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-11"
                                                aria-label={`Actions for ${getTitle(post)}`}
                                            >
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="min-w-44">
                                            <DropdownMenuItem
                                                className="min-h-11"
                                                onSelect={() => toggleStatus(post.id, post.status)}
                                            >
                                                {post.status === "published" ? <EyeOff /> : <Eye />}
                                                {post.status === "published" ? "Unpublish" : "Publish"}
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem
                                                variant="destructive"
                                                className="min-h-11"
                                                onSelect={() => deletePost(post.id)}
                                            >
                                                <Trash2 />
                                                Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                }
                            >
                                <span className="block break-words font-medium">{getTitle(post)}</span>
                                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                    {statusBadge(post.status)}
                                    {post.published_at ? <span>{formatAdminDate(post.published_at)}</span> : null}
                                </span>
                            </MobileListRow>
                        ))}
                    </MobileList>
                    <div className="min-w-0 rounded-xl border overflow-x-auto max-md:hidden">
                        <table className="w-full text-sm">
                            <thead className="border-b bg-muted/50">
                                <tr>
                                    <th className="px-4 py-3 text-left font-medium">Title</th>
                                    <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Status</th>
                                    <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Author</th>
                                    <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">Published</th>
                                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {posts.map((post) => (
                                    <tr key={post.id} className="hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-medium max-w-xs truncate">{getTitle(post)}</td>
                                        <td className="px-4 py-3 hidden sm:table-cell">{statusBadge(post.status)}</td>
                                        <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{post.author}</td>
                                        <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">
                                            {post.published_at ? formatAdminDate(post.published_at) : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right space-x-1">
                                            <Button asChild variant="ghost" size="icon" className="min-h-11 min-w-11">
                                                <Link href={to(`/settings/blogs/${post.id}`)}>
                                                    <Pencil className="h-4 w-4" />
                                                </Link>
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="min-h-11 min-w-11"
                                                onClick={() => toggleStatus(post.id, post.status)}
                                                title={post.status === "published" ? "Unpublish" : "Publish"}
                                            >
                                                {post.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="min-h-11 min-w-11 text-destructive hover:text-destructive"
                                                onClick={() => deletePost(post.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
