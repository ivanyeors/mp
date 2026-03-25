"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Trash2, Pencil, Loader2, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Collection } from "@/lib/types/ecommerce";

export default function SettingsCollectionsPage() {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);

    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);
    const [deleting, setDeleting] = useState(false);

    const fetchCollections = useCallback(async () => {
        setLoading(true);
        const res = await fetch("/api/shop/collections");
        const json = await res.json();
        setCollections(json.rows ?? []);
        setLoading(false);
    }, []);

    useEffect(() => { fetchCollections(); }, [fetchCollections]);

    const toggleActive = async (collection: Collection) => {
        setTogglingId(collection.id);
        await fetch(`/api/shop/collections/${collection.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_active: !collection.is_active }),
        });
        await fetchCollections();
        setTogglingId(null);
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        await fetch(`/api/shop/collections/${deleteTarget.id}`, { method: "DELETE" });
        setDeleteTarget(null);
        setDeleting(false);
        await fetchCollections();
    };

    const getTitle = (collection: Collection) => {
        const loc =
            collection.content?.["en-US"] ?? Object.values(collection.content ?? {})[0];
        return loc?.title ?? collection.slug;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="flex items-center gap-2">
                        <Library className="h-6 w-6" />
                        Collections
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Organise products into manual or automatic collections.
                    </p>
                </div>
                <Button asChild size="sm">
                    <Link href={to("/settings/collections/new")}>
                        <Plus className="mr-2 h-4 w-4" /> Add Collection
                    </Link>
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : collections.length === 0 ? (
                <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
                    No collections yet. Create one to group your products.
                </div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/50">
                            <tr>
                                <th className="px-4 py-3 text-left font-medium w-12">
                                    <span className="sr-only">Thumbnail</span>
                                </th>
                                <th className="px-4 py-3 text-left font-medium">Title</th>
                                <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">
                                    Type
                                </th>
                                <th className="px-4 py-3 text-left font-medium hidden md:table-cell">
                                    Products
                                </th>
                                <th className="px-4 py-3 text-left font-medium hidden lg:table-cell">
                                    Active
                                </th>
                                <th className="px-4 py-3 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {collections.map((col) => (
                                <tr key={col.id} className="hover:bg-muted/30 transition-colors">
                                    {/* Thumbnail */}
                                    <td className="px-4 py-3">
                                        <div className="h-10 w-10 rounded-md overflow-hidden bg-muted border flex items-center justify-center shrink-0">
                                            {col.image_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={col.image_url}
                                                    alt={getTitle(col)}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <Library className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </div>
                                    </td>

                                    {/* Title */}
                                    <td className="px-4 py-3 font-medium max-w-xs truncate">
                                        <Link
                                            href={to(`/settings/collections/${col.id}`)}
                                            className="hover:underline"
                                        >
                                            {getTitle(col)}
                                        </Link>
                                        <p className="text-xs text-muted-foreground font-normal">
                                            /{col.slug}
                                        </p>
                                    </td>

                                    {/* Type */}
                                    <td className="px-4 py-3 hidden sm:table-cell">
                                        <Badge
                                            variant={
                                                col.collection_type === "manual"
                                                    ? "default"
                                                    : "secondary"
                                            }
                                        >
                                            {col.collection_type}
                                        </Badge>
                                    </td>

                                    {/* Product count */}
                                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                                        {col.product_count ?? 0}
                                    </td>

                                    {/* Active toggle */}
                                    <td className="px-4 py-3 hidden lg:table-cell">
                                        <Switch
                                            checked={col.is_active}
                                            disabled={togglingId === col.id}
                                            onCheckedChange={() => toggleActive(col)}
                                        />
                                    </td>

                                    {/* Actions */}
                                    <td className="px-4 py-3 text-right space-x-1">
                                        <Button asChild variant="ghost" size="icon" className="h-8 w-8">
                                            <Link href={to(`/settings/collections/${col.id}`)}>
                                                <Pencil className="h-4 w-4" />
                                            </Link>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-destructive hover:text-destructive"
                                            onClick={() => setDeleteTarget(col)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Delete confirmation dialog */}
            <Dialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Collection</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete &quot;
                            {deleteTarget ? getTitle(deleteTarget) : ""}
                            &quot;? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={deleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={deleting}
                        >
                            {deleting ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Trash2 className="mr-2 h-4 w-4" />
                            )}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
