"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { Plus, Trash2, Package, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

// ─── Types ────────────────────────────────────────────────────────────────────

type ProductVariant = {
    id: string;
    price: number | null;
    stock_quantity: number | null;
};

type ProductImage = {
    id: string;
    url: string;
    position: number;
};

type ProductRow = {
    id: string;
    slug: string;
    status: "draft" | "active" | "archived";
    content: Record<string, { title: string; description?: string }>;
    category_id: string | null;
    product_variants: ProductVariant[];
    product_images: ProductImage[];
    created_at: string;
};

type Category = {
    id: string;
    slug: string;
    content: Record<string, { name: string }>;
};

const LIMIT = 20;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProductTitle(row: ProductRow): string {
    const loc =
        row.content?.["en-US"] ??
        row.content?.["en"] ??
        Object.values(row.content ?? {})[0];
    return loc?.title ?? row.slug;
}

function getCategoryName(cat: Category): string {
    const loc =
        cat.content?.["en-US"] ??
        cat.content?.["en"] ??
        Object.values(cat.content ?? {})[0];
    return loc?.name ?? cat.slug;
}

function getPriceRange(variants: ProductVariant[]): string {
    if (!variants || variants.length === 0) return "No variants";
    const prices = variants
        .map((v) => v.price)
        .filter((p): p is number => p !== null && p !== undefined);
    if (prices.length === 0) return "No price";
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const fmt = (n: number) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
    return min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

function getTotalStock(variants: ProductVariant[]): number {
    if (!variants || variants.length === 0) return 0;
    return variants.reduce((sum, v) => sum + (v.stock_quantity ?? 0), 0);
}

function getThumbnailUrl(images: ProductImage[]): string | null {
    if (!images || images.length === 0) return null;
    const sorted = [...images].sort((a, b) => a.position - b.position);
    return sorted[0]?.url ?? null;
}

type StatusVariant = "default" | "secondary" | "outline";

function statusBadgeVariant(status: string): StatusVariant {
    if (status === "active") return "default";
    if (status === "draft") return "secondary";
    return "outline";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsProductsPage() {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    // Filter state
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    // Data state
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<Category[]>([]);

    // Selection state
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);

    // Debounce search
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(search);
            setPage(1);
        }, 350);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [search]);

    // Reset page when filters change
    useEffect(() => { setPage(1); }, [statusFilter, categoryFilter]);

    // Fetch categories once
    useEffect(() => {
        fetch("/api/shop/categories")
            .then((r) => r.json())
            .then((json) => setCategories(json.rows ?? []))
            .catch(() => {});
    }, []);

    // Fetch products
    const fetchProducts = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (categoryFilter !== "all") params.set("category_id", categoryFilter);
        params.set("page", String(page));
        params.set("limit", String(LIMIT));

        try {
            const res = await fetch(`/api/shop/products?${params.toString()}`);
            const json = await res.json();
            setProducts(json.rows ?? []);
            setTotal(json.total ?? 0);
        } catch {
            setProducts([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, statusFilter, categoryFilter, page]);

    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    // Clear selection when products change
    useEffect(() => { setSelected(new Set()); }, [products]);

    // ── Selection helpers ──
    const allSelected =
        products.length > 0 && products.every((p) => selected.has(p.id));
    const someSelected = selected.size > 0 && !allSelected;

    const toggleAll = () => {
        if (allSelected) {
            setSelected(new Set());
        } else {
            setSelected(new Set(products.map((p) => p.id)));
        }
    };

    const toggleOne = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ── Bulk delete ──
    const bulkDelete = async () => {
        if (
            !confirm(
                `Delete ${selected.size} product${selected.size > 1 ? "s" : ""}? This cannot be undone.`
            )
        )
            return;
        setDeleting(true);
        await Promise.all(
            [...selected].map((id) =>
                fetch(`/api/shop/products/${id}`, { method: "DELETE" })
            )
        );
        setDeleting(false);
        setSelected(new Set());
        fetchProducts();
    };

    // ── Pagination ──
    const totalPages = Math.ceil(total / LIMIT);

    const buildPageNumbers = (): (number | "ellipsis")[] => {
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const pages: (number | "ellipsis")[] = [1];
        if (page > 3) pages.push("ellipsis");
        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
            pages.push(i);
        }
        if (page < totalPages - 2) pages.push("ellipsis");
        pages.push(totalPages);
        return pages;
    };

    // ── Category map ──
    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
                    <p className="text-muted-foreground mt-1 text-sm">
                        Manage your store products, variants, and inventory.
                    </p>
                </div>
                <Button asChild size="sm">
                    <Link href={to("/settings/products/new")}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Product
                    </Link>
                </Button>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder="Search products..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-full sm:w-44">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                                {getCategoryName(cat)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Bulk actions bar */}
            {selected.size > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5">
                    <span className="text-sm font-medium text-destructive">
                        {selected.size} selected
                    </span>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={bulkDelete}
                        disabled={deleting}
                    >
                        {deleting ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        Delete selected
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(new Set())}
                        disabled={deleting}
                    >
                        Clear
                    </Button>
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : products.length === 0 ? (
                <div className="rounded-xl border border-dashed p-14 text-center">
                    <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                        {debouncedSearch || statusFilter !== "all" || categoryFilter !== "all"
                            ? "No products match your filters."
                            : "No products yet. Add your first product to get started."}
                    </p>
                    {!debouncedSearch && statusFilter === "all" && categoryFilter === "all" && (
                        <Button asChild size="sm" className="mt-4">
                            <Link href={to("/settings/products/new")}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Product
                            </Link>
                        </Button>
                    )}
                </div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="w-10 px-4">
                                    <Checkbox
                                        checked={allSelected}
                                        ref={(el) => {
                                            if (el) {
                                                (el as HTMLButtonElement & { indeterminate?: boolean }).indeterminate =
                                                    someSelected;
                                            }
                                        }}
                                        onCheckedChange={toggleAll}
                                        aria-label="Select all"
                                    />
                                </TableHead>
                                <TableHead className="w-12 px-2" />
                                <TableHead className="px-4">Product</TableHead>
                                <TableHead className="px-4 hidden sm:table-cell">Status</TableHead>
                                <TableHead className="px-4 hidden md:table-cell">Price</TableHead>
                                <TableHead className="px-4 hidden lg:table-cell">Stock</TableHead>
                                <TableHead className="px-4 hidden xl:table-cell">Category</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {products.map((product) => {
                                const thumbnailUrl = getThumbnailUrl(product.product_images);
                                const title = getProductTitle(product);
                                const priceRange = getPriceRange(product.product_variants);
                                const stock = getTotalStock(product.product_variants);
                                const category = product.category_id
                                    ? categoryMap.get(product.category_id)
                                    : null;
                                const isSelected = selected.has(product.id);

                                return (
                                    <TableRow
                                        key={product.id}
                                        className="cursor-pointer transition-colors"
                                        data-selected={isSelected}
                                        onClick={(e) => {
                                            // Don't navigate if clicking checkbox
                                            const target = e.target as HTMLElement;
                                            if (
                                                target.closest('[role="checkbox"]') ||
                                                target.closest("button")
                                            )
                                                return;
                                            router.push(to(`/settings/products/${product.id}`));
                                        }}
                                    >
                                        <TableCell
                                            className="w-10 px-4"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <Checkbox
                                                checked={isSelected}
                                                onCheckedChange={() => toggleOne(product.id)}
                                                aria-label={`Select ${title}`}
                                            />
                                        </TableCell>

                                        {/* Thumbnail */}
                                        <TableCell className="w-12 px-2 py-2">
                                            {thumbnailUrl ? (
                                                <div className="relative h-10 w-10 overflow-hidden rounded-md border bg-muted shrink-0">
                                                    <Image
                                                        src={thumbnailUrl}
                                                        alt={title}
                                                        fill
                                                        className="object-cover"
                                                        sizes="40px"
                                                    />
                                                </div>
                                            ) : (
                                                <div className="flex h-10 w-10 items-center justify-center rounded-md border bg-muted shrink-0">
                                                    <Package className="h-4 w-4 text-muted-foreground/50" />
                                                </div>
                                            )}
                                        </TableCell>

                                        {/* Name */}
                                        <TableCell className="px-4 py-3">
                                            <span className="font-medium line-clamp-1">{title}</span>
                                            <span className="block text-xs text-muted-foreground mt-0.5 font-mono">
                                                {product.slug}
                                            </span>
                                        </TableCell>

                                        {/* Status */}
                                        <TableCell className="px-4 hidden sm:table-cell">
                                            <Badge variant={statusBadgeVariant(product.status)} className="capitalize">
                                                {product.status}
                                            </Badge>
                                        </TableCell>

                                        {/* Price range */}
                                        <TableCell className="px-4 hidden md:table-cell text-sm text-muted-foreground">
                                            {priceRange}
                                        </TableCell>

                                        {/* Stock */}
                                        <TableCell className="px-4 hidden lg:table-cell text-sm">
                                            <span
                                                className={
                                                    stock === 0
                                                        ? "text-destructive font-medium"
                                                        : stock < 10
                                                        ? "text-yellow-600 dark:text-yellow-400 font-medium"
                                                        : "text-muted-foreground"
                                                }
                                            >
                                                {stock}
                                            </span>
                                        </TableCell>

                                        {/* Category */}
                                        <TableCell className="px-4 hidden xl:table-cell text-sm text-muted-foreground">
                                            {category ? getCategoryName(category) : "—"}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of{" "}
                        {total} product{total !== 1 ? "s" : ""}
                    </p>
                    <Pagination className="w-auto mx-0">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page > 1) setPage(page - 1);
                                    }}
                                    aria-disabled={page <= 1}
                                    className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                                />
                            </PaginationItem>

                            {buildPageNumbers().map((item, idx) =>
                                item === "ellipsis" ? (
                                    <PaginationItem key={`ellipsis-${idx}`}>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                ) : (
                                    <PaginationItem key={item}>
                                        <PaginationLink
                                            href="#"
                                            isActive={item === page}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setPage(item);
                                            }}
                                        >
                                            {item}
                                        </PaginationLink>
                                    </PaginationItem>
                                )
                            )}

                            <PaginationItem>
                                <PaginationNext
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (page < totalPages) setPage(page + 1);
                                    }}
                                    aria-disabled={page >= totalPages}
                                    className={
                                        page >= totalPages ? "pointer-events-none opacity-50" : ""
                                    }
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
}
