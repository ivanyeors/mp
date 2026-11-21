"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { Trash2, Package, PackagePlus, Loader2, Search, RefreshCw, DollarSign } from "lucide-react";
import { EmptyState } from "@/components/settings/empty-state";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageActions, pageActionClassName } from "@/components/ui/page-actions";
import { useMobileDockActions } from "@/components/ui/page-dock-actions";
import { InfoTip } from "@/components/ui/info-tip";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatCurrency } from "@/lib/i18n/currencies";
import { CategoriesManager } from "./categories-manager";
import { stripePriceIdOf, type StripeMode } from "@/lib/stripe/mode";
import { ShopListingToggles } from "@/components/settings/shop-listing-toggles";
import { InventoryPushSheet } from "@/components/settings/inventory-push-sheet";

type ProductVariant = {
    id: string;
    price: number | null;
    cost_price?: number | string | null;
    stock_quantity: number | null;
    stock_available?: number | null;
    stripe_price_id?: string | null;
    stripe_price_id_test?: string | null;
    item_id?: number | null;
    pillow_product_id?: number | null;
    price_key?: string | null;
};

type ProductImage = {
    id: string;
    url: string;
    position: number;
};

export type ProductRow = {
    id: string;
    slug: string;
    status: "draft" | "active" | "archived";
    product_type: string | null;
    is_auto_generated?: boolean;
    content: Record<string, { title: string; description?: string }>;
    category_id: string | null;
    product_variants: ProductVariant[];
    product_images: ProductImage[];
    created_at: string;
};

function isLegacyProduct(product: ProductRow): boolean {
    if (product.is_auto_generated) return false;
    return !(product.product_variants ?? []).some(
        (v) => v.item_id != null || v.pillow_product_id != null || v.price_key != null,
    );
}

export type Category = {
    id: string;
    slug: string;
    content: Record<string, { name: string }>;
};

export type ProductsListResponse = {
    ok: true;
    rows: ProductRow[];
    total: number;
    page: number;
    limit: number;
};

export type CategoriesListResponse = {
    ok: true;
    rows: Category[];
};

export type ProductsInitialData = {
    products: ProductsListResponse;
    categories: CategoriesListResponse;
};

const LIMIT = 20;

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
    const fmt = (n: number) => formatCurrency(n);
    return min === max ? fmt(min) : `${fmt(min)} to ${fmt(max)}`;
}

function getCostRange(variants: ProductVariant[]): string | null {
    const costs = (variants ?? [])
        .map((v) => (v.cost_price == null || v.cost_price === "" ? null : Number(v.cost_price)))
        .filter((c): c is number => c != null && Number.isFinite(c));
    if (costs.length === 0) return null;
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    return min === max ? `Cost ${formatCurrency(min)}` : `Cost ${formatCurrency(min)} to ${formatCurrency(max)}`;
}

function getTotalStock(variants: ProductVariant[]): { value: number; hasStockAvailable: boolean } {
    if (!variants || variants.length === 0) return { value: 0, hasStockAvailable: false };
    const hasStockAvailable = variants.some((v) => v.stock_available != null);
    if (hasStockAvailable) {
        const total = variants.reduce((sum, v) => sum + (v.stock_available ?? v.stock_quantity ?? 0), 0);
        return { value: total, hasStockAvailable: true };
    }
    return { value: variants.reduce((sum, v) => sum + (v.stock_quantity ?? 0), 0), hasStockAvailable: false };
}

function hasPriceWarning(variants: ProductVariant[]): boolean {
    return variants.some((v) => v.price === 0 || v.price === null);
}

function hasMissingStripe(variants: ProductVariant[], mode: StripeMode): boolean {
    return variants.some((v) => !stripePriceIdOf(v, mode));
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

export function ProductsClient({
    initialData,
    initialTab = "products",
    stripeMode,
}: {
    initialData?: ProductsInitialData;
    initialTab?: string;
    stripeMode: StripeMode;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    const [tab, setTab] = useState(initialTab);
    const [tabFromUrl, setTabFromUrl] = useState(initialTab);
    if (initialTab !== tabFromUrl) {
        setTabFromUrl(initialTab);
        setTab(initialTab);
    }

    const [typeFilter, setTypeFilter] = useState<string>("all");

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [page, setPage] = useState(1);

    const [products, setProducts] = useState<ProductRow[]>(initialData?.products.rows ?? []);
    const [total, setTotal] = useState(initialData?.products.total ?? 0);
    const [loading, setLoading] = useState(!initialData);
    const [categories, setCategories] = useState<Category[]>(
        initialData?.categories.rows ?? [],
    );

    const hydratedFromServer = useRef(Boolean(initialData));

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);

    const activeTab = typeFilter === "accessory" ? "accessories" : "pillows";

    const [pushSheetOpen, setPushSheetOpen] = useState(false);
    const [shopListVersion, setShopListVersion] = useState(0);

    const [syncing, setSyncing] = useState(false);
    const [resyncingPrices, setResyncingPrices] = useState(false);

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

    const changeStatus = (value: string) => {
        setStatusFilter(value);
        setPage(1);
    };
    const changeCategory = (value: string) => {
        setCategoryFilter(value);
        setPage(1);
    };
    const changeType = (value: string) => {
        setTypeFilter(value);
        setPage(1);
        setSelected(new Set());
    };

    useEffect(() => {
        if (initialData) return;
        fetch("/api/shop/categories")
            .then((r) => r.json())
            .then((json) => setCategories(json.rows ?? []))
            .catch(() => {});
    }, [initialData]);

    const latestRequest = useRef(0);
    const fetchProducts = useCallback(async () => {
        const request = ++latestRequest.current;
        setLoading(true);
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (categoryFilter !== "all") params.set("category_id", categoryFilter);
        params.set("page", String(page));
        params.set("limit", String(LIMIT));
        params.set("include_custom", "true");

        if (typeFilter === "pillow") params.set("product_type", "pillow");
        else if (typeFilter === "bolster") params.set("product_type", "bolster");
        else if (typeFilter === "accessory") params.set("product_type", "accessory");
        else if (typeFilter === "bundle") params.set("product_type", "bundle");

        let rows: ProductRow[] = [];
        let count = 0;
        try {
            const res = await fetch(`/api/shop/products?${params.toString()}`);
            const json = await res.json();
            rows = json.rows ?? [];
            count = json.total ?? 0;
        } catch {}
        if (request !== latestRequest.current) return;
        setProducts(rows);
        setTotal(count);
        setSelected(new Set());
        setLoading(false);
    }, [debouncedSearch, statusFilter, categoryFilter, page, typeFilter]);

    useEffect(() => {
        if (hydratedFromServer.current) {
            hydratedFromServer.current = false;
            return;
        }
        fetchProducts();
    }, [fetchProducts]);

    const syncFromInventory = async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/shop/products/sync-inventory", {
                method: "POST",
            });
            if (!res.ok) {
                const json = await res.json().catch(() => ({}));
                throw new Error(json.error ?? "Couldn't sync.");
            }
            const json = await res.json();
            toast.success(json.message ?? "Inventory synced");
            fetchProducts();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't sync inventory.");
        } finally {
            setSyncing(false);
        }
    };

    const resyncPrices = async () => {
        setResyncingPrices(true);
        try {
            const res = await fetch("/api/shop/products/resync-prices", { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error ?? "Couldn't resync.");
            toast.success(json.message ?? "Prices resynced from Costings");
            if (json.unresolvable?.length) {
                toast.warning(`${json.unresolvable.length} variant(s) have no costing source`);
            }
            fetchProducts();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't resync prices.");
        } finally {
            setResyncingPrices(false);
        }
    };

    useMobileDockActions([
        {
            id: "add-from-inventory",
            title: "Add from Inventory",
            icon: PackagePlus,
            onClick: () => setPushSheetOpen(true),
        },
        {
            id: "sync-inventory",
            title: syncing ? "Syncing…" : "Sync from Inventory",
            icon: RefreshCw,
            onClick: () => void syncFromInventory(),
        },
        {
            id: "resync-prices",
            title: resyncingPrices ? "Resyncing…" : "Resync prices",
            icon: DollarSign,
            onClick: () => void resyncPrices(),
        },
    ]);

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

    const bulkDelete = async () => {
        if (
            !confirm(
                `Delete ${selected.size} product${selected.size > 1 ? "s" : ""}? This can't be undone.`
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

    const categoryMap = new Map(categories.map((c) => [c.id, c]));

    const isAccessoriesTab = typeFilter === "accessory";
    const stockColumnLabel = "Stock";

    const renderProductTable = () => {
        if (loading) {
            return (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            );
        }

        if (products.length === 0) {
            return (
                <EmptyState
                    icon={Package}
                    action={
                        activeTab === "accessories" ? (
                            <Button size="sm" variant="outline" onClick={() => setPushSheetOpen(true)}>
                                Add from Inventory
                            </Button>
                        ) : undefined
                    }
                >
                    {debouncedSearch || statusFilter !== "all" || categoryFilter !== "all"
                        ? "No products match your filters."
                        : activeTab === "pillows"
                        ? "No pillows or bolsters yet. Sync from inventory."
                        : "No accessories in Products yet."}
                </EmptyState>
            );
        }

        return (
            <div className="rounded-xl border overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-muted/50 hover:bg-muted/50">
                            {isAccessoriesTab && (
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
                            )}
                            <TableHead className="w-12 px-2" />
                            <TableHead className="px-4">Product</TableHead>
                            <TableHead className="px-4 hidden sm:table-cell">Status</TableHead>
                            <TableHead className="px-4 hidden md:table-cell">Price</TableHead>
                            <TableHead className="px-4 hidden lg:table-cell">{stockColumnLabel}</TableHead>
                            <TableHead className="px-4 hidden xl:table-cell">Category</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.map((product) => {
                            const thumbnailUrl = getThumbnailUrl(product.product_images);
                            const title = getProductTitle(product);
                            const priceRange = getPriceRange(product.product_variants);
                            const costRange = getCostRange(product.product_variants);
                            const { value: stock } = getTotalStock(product.product_variants);
                            const priceWarn = hasPriceWarning(product.product_variants);
                            const stripeWarn = hasMissingStripe(product.product_variants, stripeMode);
                            const category = product.category_id
                                ? categoryMap.get(product.category_id)
                                : null;
                            const isSelected = selected.has(product.id);

                            return (
                                <TableRow
                                    key={product.id}
                                    className="cursor-pointer transition-colors"
                                    data-selected={isAccessoriesTab ? isSelected : undefined}
                                    onClick={(e) => {
                                        const target = e.target as HTMLElement;
                                        if (
                                            target.closest('[role="checkbox"]') ||
                                            target.closest("button")
                                        )
                                            return;
                                        router.push(to(`/settings/products/${product.id}`));
                                    }}
                                >
                                    {isAccessoriesTab && (
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
                                    )}

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

                                    <TableCell className="px-4 py-3">
                                        <span className="font-medium line-clamp-1">{title}</span>
                                        <span className="block text-xs text-muted-foreground mt-0.5">
                                            {product.slug}
                                        </span>
                                        {isLegacyProduct(product) && (
                                            <Badge variant="outline" className="mt-1 text-xs text-amber-700 border-amber-300">
                                                Legacy / not inventory-linked
                                            </Badge>
                                        )}
                                    </TableCell>

                                    <TableCell className="px-4 hidden sm:table-cell">
                                        <Badge variant={statusBadgeVariant(product.status)} className="capitalize">
                                            {product.status}
                                        </Badge>
                                    </TableCell>

                                    <TableCell className="px-4 hidden md:table-cell text-sm text-muted-foreground">
                                        <span>{priceRange}</span>
                                        {costRange && (
                                            <span className="block text-xs text-muted-foreground/80">{costRange}</span>
                                        )}
                                        {priceWarn && (
                                            <Badge variant="outline" className="ml-2 text-xs text-amber-600 border-amber-300">
                                                {product.is_auto_generated ? "No costing source" : "Price not set"}
                                            </Badge>
                                        )}
                                        {stripeWarn && (
                                            <Badge variant="outline" className="ml-1 text-xs text-red-600 border-red-300">
                                                No Stripe
                                            </Badge>
                                        )}
                                    </TableCell>

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

                                    <TableCell className="px-4 hidden xl:table-cell text-sm text-muted-foreground">
                                        {category ? getCategoryName(category) : "\u2014"}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>
        );
    };

    const renderPagination = () => {
        if (totalPages <= 1) return null;
        return (
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * LIMIT + 1}&ndash;{Math.min(page * LIMIT, total)} of{" "}
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
        );
    };

    const renderToolbar = () => (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                    placeholder="Search products…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:contents">
            <Select value={typeFilter} onValueChange={changeType}>
                <SelectTrigger className="w-full max-sm:min-w-0 sm:w-40">
                    <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="pillow">Pillows</SelectItem>
                    <SelectItem value="bolster">Bolsters</SelectItem>
                    <SelectItem value="accessory">Accessories</SelectItem>
                    <SelectItem value="bundle">Bundles</SelectItem>
                </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={changeStatus}>
                <SelectTrigger className="w-full max-sm:min-w-0 sm:w-40">
                    <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
            </Select>

            <Select value={categoryFilter} onValueChange={changeCategory}>
                <SelectTrigger className="w-full max-sm:col-span-2 max-sm:min-w-0 sm:w-44">
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
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-1.5">
                <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
                <InfoTip label="About Products">
                    Storefront products are built from inventory and priced in Costings. Push new
                    items with Add from Inventory, then switch them on under In the shop.
                </InfoTip>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="products">Products</TabsTrigger>
                    <TabsTrigger value="shop">In the shop</TabsTrigger>
                    <TabsTrigger value="categories">Categories</TabsTrigger>
                </TabsList>

                <TabsContent value="products" className="mt-6 space-y-6">
                    <PageActions docked>
                        <Button
                            size="sm"
                            className={pageActionClassName}
                            onClick={() => setPushSheetOpen(true)}
                        >
                            <PackagePlus className="mr-2 h-4 w-4" />
                            Add from Inventory
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className={pageActionClassName}
                            onClick={syncFromInventory}
                            disabled={syncing || resyncingPrices}
                        >
                            {syncing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Sync from Inventory
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className={pageActionClassName}
                            onClick={resyncPrices}
                            disabled={syncing || resyncingPrices}
                        >
                            {resyncingPrices ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <DollarSign className="mr-2 h-4 w-4" />
                            )}
                            Resync prices
                        </Button>
                    </PageActions>

                    {renderToolbar()}

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

                    {renderProductTable()}
                    {renderPagination()}
                </TabsContent>

                <TabsContent value="shop" className="mt-6">
                    <ShopListingToggles
                        key={shopListVersion}
                        onAddFromInventory={() => setPushSheetOpen(true)}
                    />
                </TabsContent>

                <TabsContent value="categories" className="mt-6">
                    <CategoriesManager />
                </TabsContent>

            </Tabs>

            <InventoryPushSheet
                open={pushSheetOpen}
                onOpenChange={setPushSheetOpen}
                onPushed={() => {
                    void fetchProducts();
                    setShopListVersion((v) => v + 1);
                }}
            />
        </div>
    );
}
