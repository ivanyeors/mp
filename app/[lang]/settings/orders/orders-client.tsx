"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
    Package,
    DollarSign,
    ShoppingCart,
    Clock,
    TrendingUp,
    Search,
    Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { ShopifySalesSection } from "@/components/settings/shopify-sales-section";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { formatCurrency } from "@/lib/i18n/currencies";
import { formatAdminDateTimeMY } from "@/lib/format/admin-date";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Order, OrderMargin, OrderStatus } from "@/lib/types/ecommerce";
import { InfoTip } from "@/components/ui/info-tip";

// ─── Types ────────────────────────────────────────────────────────────────────

type DashboardStats = {
    total_orders: number;
    revenue: number;
    avg_order_value: number;
    pending_orders: number;
    total_gross_margin?: number | null;
    avg_margin_pct?: number | null;
};

type OrderRow = Order & {
    items_count?: number;
    margin?: Pick<OrderMargin, "gross_margin" | "margin_pct"> | null;
    /** Referral attribution (#74/#77): non-null on partner-sourced orders. */
    partner_id?: string | null;
    ref_code?: string | null;
};

/**
 * Server-rendered first paint. Exactly the JSON `/api/shop/orders/dashboard`
 * and `/api/shop/orders?page=1&limit=20` return, pre-fetched by the RSC page
 * wrapper. Either half is null when its server load failed, in which case the
 * client falls back to fetching it on mount.
 */
export type OrdersInitialData = {
    dashboard: {
        ok: true;
        stats: {
            total_orders: number;
            revenue: number;
            avg_order_value: number;
            total_revenue: number;
            average_order_value: number;
            pending_orders: number;
            total_gross_margin: number;
            avg_margin_pct: number | null;
        };
    } | null;
    list: {
        ok: true;
        rows: OrderRow[];
        total: number;
        page: number;
        limit: number;
    } | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 20;

const ORDER_STATUSES: OrderStatus[] = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSGD(amount: number): string {
    return formatCurrency(amount);
}

function formatDate(dateStr: string): string {
    return formatAdminDateTimeMY(dateStr);
}

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

function orderStatusBadgeVariant(status: OrderStatus): BadgeVariant {
    switch (status) {
        case "pending":
            return "secondary";
        case "confirmed":
            return "default";
        case "cancelled":
            return "destructive";
        case "refunded":
            return "outline";
        default:
            return "default";
    }
}

function orderStatusBadgeClass(status: OrderStatus): string {
    switch (status) {
        case "processing":
            return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
        case "shipped":
            return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800";
        case "delivered":
            return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
        default:
            return "";
    }
}

function formatMarginPct(pct: number | null | undefined): string {
    if (pct == null || Number.isNaN(pct)) return "—";
    return `${pct.toFixed(1)}%`;
}


/** Same normalisation the dashboard fetch applies, shared with the server seed. */
function toDashboardStats(s: {
    total_orders?: number;
    revenue?: number;
    total_revenue?: number;
    avg_order_value?: number;
    average_order_value?: number;
    pending_orders?: number;
    total_gross_margin?: number | null;
    avg_margin_pct?: number | null;
}): DashboardStats {
    return {
        total_orders: s.total_orders ?? 0,
        revenue: s.total_revenue ?? s.revenue ?? 0,
        avg_order_value: s.average_order_value ?? s.avg_order_value ?? 0,
        pending_orders: s.pending_orders ?? 0,
        total_gross_margin: s.total_gross_margin ?? null,
        avg_margin_pct: s.avg_margin_pct ?? null,
    };
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    loading,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    loading: boolean;
}) {
    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        {loading ? (
                            <div className="mt-1 h-5 w-20 animate-pulse rounded bg-muted" />
                        ) : (
                            <p className="text-lg font-semibold leading-tight">{value}</p>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsOrdersPage({
    initialData,
}: {
    initialData?: OrdersInitialData;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    // Filter state
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [page, setPage] = useState(1);
    const [ordersTab, setOrdersTab] = useState<"platform" | "shopify">("platform");
    const dateRangeError =
        dateFrom && dateTo && dateFrom > dateTo
            ? "From date must be on or before To date."
            : null;

    // Data state — seeded from the server render when available.
    const [orders, setOrders] = useState<OrderRow[]>(initialData?.list?.rows ?? []);
    const [total, setTotal] = useState(initialData?.list?.total ?? 0);
    const [loading, setLoading] = useState(!initialData?.list);

    // Dashboard stats
    const [stats, setStats] = useState<DashboardStats | null>(
        initialData?.dashboard ? toDashboardStats(initialData.dashboard.stats) : null,
    );
    const [statsLoading, setStatsLoading] = useState(!initialData?.dashboard);

    // The server already delivered the first page of each; skip the duplicate
    // mount fetch, but leave every later fetch (filters, paging) untouched.
    const skipStatsFetch = useRef(Boolean(initialData?.dashboard));
    const skipOrdersFetch = useRef(Boolean(initialData?.list));
    const summaryStats = dateRangeError ? null : stats;
    const summaryStatsLoading = dateRangeError ? false : statsLoading;

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
    useEffect(() => {
        setPage(1);
    }, [statusFilter, dateFrom, dateTo]);

    // Fetch dashboard stats for the selected sales window
    useEffect(() => {
        if (skipStatsFetch.current) {
            skipStatsFetch.current = false;
            return;
        }
        if (dateRangeError) return;

        const params = new URLSearchParams();
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        let cancelled = false;
        fetch(`/api/shop/orders/dashboard?${params.toString()}`)
            .then((r) => r.json())
            .then((json) => {
                if (cancelled) return;
                setStats(toDashboardStats(json.stats ?? json));
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setStatsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [dateFrom, dateTo, dateRangeError]);

    // Fetch orders
    const fetchOrders = useCallback(async () => {
        if (dateRangeError) {
            setOrders([]);
            setTotal(0);
            setLoading(false);
            return;
        }

        setLoading(true);
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        params.set("page", String(page));
        params.set("limit", String(LIMIT));

        try {
            const res = await fetch(`/api/shop/orders?${params.toString()}`);
            const json = await res.json();
            setOrders(json.rows ?? []);
            setTotal(json.total ?? 0);
        } catch {
            setOrders([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, statusFilter, dateFrom, dateTo, dateRangeError, page]);

    useEffect(() => {
        if (skipOrdersFetch.current) {
            skipOrdersFetch.current = false;
            return;
        }
        fetchOrders();
    }, [fetchOrders]);

    // Pagination helpers
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

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
                  <InfoTip label="About Orders">
                    <p>View and manage all customer orders.</p>
                  </InfoTip>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <SummaryCard
                    icon={ShoppingCart}
                    label="Total Orders"
                    value={summaryStats ? String(summaryStats.total_orders) : "—"}
                    loading={summaryStatsLoading}
                />
                <SummaryCard
                    icon={DollarSign}
                    label="Revenue"
                    value={summaryStats ? formatSGD(summaryStats.revenue) : "—"}
                    loading={summaryStatsLoading}
                />
                <SummaryCard
                    icon={TrendingUp}
                    label="Avg Order Value"
                    value={summaryStats ? formatSGD(summaryStats.avg_order_value) : "—"}
                    loading={summaryStatsLoading}
                />
                {!summaryStatsLoading && summaryStats && (
                    <SummaryCard
                        icon={TrendingUp}
                        label="Gross Margin"
                        value={`${formatSGD(summaryStats.total_gross_margin ?? 0)}${summaryStats.avg_margin_pct != null ? ` · ${formatMarginPct(summaryStats.avg_margin_pct)} avg` : ""}`}
                        loading={summaryStatsLoading}
                    />
                )}
                <SummaryCard
                    icon={Clock}
                    label="Pending Orders"
                    value={summaryStats ? String(summaryStats.pending_orders) : "—"}
                    loading={summaryStatsLoading}
                />
            </div>

            <Tabs
                value={ordersTab}
                onValueChange={(v) => setOrdersTab(v === "shopify" ? "shopify" : "platform")}
            >
                <TabsList>
                    <TabsTrigger value="platform">Orders</TabsTrigger>
                    <TabsTrigger value="shopify">Shopify Sales</TabsTrigger>
                </TabsList>

                <TabsContent value="platform" className="space-y-6 mt-6">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder="Search by order # or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-44">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {ORDER_STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                            setDateFrom(e.target.value);
                            setStatsLoading(true);
                        }}
                        max={dateTo || undefined}
                        className="w-full sm:w-40"
                        aria-label="From date"
                    />
                    <span className="text-muted-foreground text-sm hidden sm:inline">to</span>
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                            setDateTo(e.target.value);
                            setStatsLoading(true);
                        }}
                        min={dateFrom || undefined}
                        className="w-full sm:w-40"
                        aria-label="To date"
                    />
                </div>
                {dateRangeError && (
                    <p role="alert" className="basis-full text-sm text-destructive">
                        {dateRangeError}
                    </p>
                )}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : orders.length === 0 ? (
                <div className="rounded-xl border border-dashed p-14 text-center">
                    <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                        {debouncedSearch || statusFilter !== "all" || dateFrom || dateTo
                            ? "No orders match your filters."
                            : "No orders yet."}
                    </p>
                </div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4">Order #</TableHead>
                                <TableHead className="px-4 hidden sm:table-cell">Date</TableHead>
                                <TableHead className="px-4 hidden md:table-cell">Customer</TableHead>
                                <TableHead className="px-4">Status</TableHead>
                                <TableHead className="px-4 hidden lg:table-cell text-right">Items</TableHead>
                                <TableHead className="px-4 hidden xl:table-cell text-right">Margin</TableHead>
                                <TableHead className="px-4 text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {orders.map((order) => {
                                const customClass = orderStatusBadgeClass(order.status);
                                const variant = orderStatusBadgeVariant(order.status);
                                const itemCount = order.items_count ?? 0;

                                return (
                                    <TableRow
                                        key={order.id}
                                        className="cursor-pointer transition-colors"
                                        onClick={() =>
                                            router.push(to(`/settings/orders/${order.id}`))
                                        }
                                    >
                                        <TableCell className="px-4 py-3">
                                            <span className="font-bold text-sm">
                                                #{order.order_number}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-4 hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">
                                            {formatDate(order.created_at)}
                                        </TableCell>
                                        <TableCell className="px-4 hidden md:table-cell text-sm text-muted-foreground">
                                            {order.email}
                                        </TableCell>
                                        <TableCell className="px-4">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <Badge
                                                    variant={customClass ? "outline" : variant}
                                                    className={`capitalize ${customClass}`}
                                                >
                                                    {order.status}
                                                </Badge>
                                                {order.partner_id && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-[10px] px-1.5 py-0"
                                                        title={order.ref_code ? `Referral: ${order.ref_code}` : "Partner-referred"}
                                                    >
                                                        Partner
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 hidden lg:table-cell text-right text-sm text-muted-foreground">
                                            {itemCount}
                                        </TableCell>
                                        <TableCell className="px-4 hidden xl:table-cell text-right text-sm text-muted-foreground">
                                            {order.margin?.gross_margin != null ? (
                                                <span>
                                                    {formatSGD(order.margin.gross_margin)}
                                                    {order.margin.margin_pct != null && (
                                                        <span className="block text-xs">
                                                            {formatMarginPct(order.margin.margin_pct)}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                "—"
                                            )}
                                        </TableCell>
                                        <TableCell className="px-4 text-right text-sm font-medium">
                                            {formatSGD(order.total)}
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
                        {total} order{total !== 1 ? "s" : ""}
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
                </TabsContent>

                <TabsContent value="shopify" className="mt-6">
                    <ShopifySalesSection />
                </TabsContent>
            </Tabs>
        </div>
    );
}

