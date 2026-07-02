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
import { Button } from "@/components/ui/button";
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
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { formatCurrency } from "@/lib/i18n/currencies";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { Order, OrderMargin, OrderStatus } from "@/lib/types/ecommerce";

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
    margin?: Pick<OrderMargin, "gross_margin" | "margin_pct"> | null;
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
    return new Intl.DateTimeFormat("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(dateStr));
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

export default function SettingsOrdersPage() {
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

    // Data state
    const [orders, setOrders] = useState<OrderRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    // Dashboard stats
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(true);

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

    // Fetch dashboard stats once
    useEffect(() => {
        setStatsLoading(true);
        fetch("/api/shop/orders/dashboard")
            .then((r) => r.json())
            .then((json) => {
                const s = json.stats ?? json;
                setStats({
                    total_orders: s.total_orders ?? 0,
                    revenue: s.total_revenue ?? s.revenue ?? 0,
                    avg_order_value: s.average_order_value ?? s.avg_order_value ?? 0,
                    pending_orders: s.pending_orders ?? 0,
                    total_gross_margin: s.total_gross_margin ?? null,
                    avg_margin_pct: s.avg_margin_pct ?? null,
                });
            })
            .catch(() => {})
            .finally(() => setStatsLoading(false));
    }, []);

    // Fetch orders
    const fetchOrders = useCallback(async () => {
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
    }, [debouncedSearch, statusFilter, dateFrom, dateTo, page]);

    useEffect(() => {
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
                <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    View and manage all customer orders.
                </p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <SummaryCard
                    icon={ShoppingCart}
                    label="Total Orders"
                    value={stats ? String(stats.total_orders) : "—"}
                    loading={statsLoading}
                />
                <SummaryCard
                    icon={DollarSign}
                    label="Revenue"
                    value={stats ? formatSGD(stats.revenue) : "—"}
                    loading={statsLoading}
                />
                <SummaryCard
                    icon={TrendingUp}
                    label="Avg Order Value"
                    value={stats ? formatSGD(stats.avg_order_value) : "—"}
                    loading={statsLoading}
                />
                {!statsLoading && stats && (
                    <SummaryCard
                        icon={TrendingUp}
                        label="Gross Margin"
                        value={`${formatSGD(stats.total_gross_margin ?? 0)}${stats.avg_margin_pct != null ? ` · ${formatMarginPct(stats.avg_margin_pct)} avg` : ""}`}
                        loading={statsLoading}
                    />
                )}
                <SummaryCard
                    icon={Clock}
                    label="Pending Orders"
                    value={stats ? String(stats.pending_orders) : "—"}
                    loading={statsLoading}
                />
            </div>

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

                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-40"
                        aria-label="From date"
                    />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-40"
                        aria-label="To date"
                    />
                </div>
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
                                const itemCount = order.items?.length ?? 0;

                                return (
                                    <TableRow
                                        key={order.id}
                                        className="cursor-pointer transition-colors"
                                        onClick={() =>
                                            router.push(to(`/settings/orders/${order.id}`))
                                        }
                                    >
                                        <TableCell className="px-4 py-3">
                                            <span className="font-bold font-mono text-sm">
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
                                            <Badge
                                                variant={customClass ? "outline" : variant}
                                                className={`capitalize ${customClass}`}
                                            >
                                                {order.status}
                                            </Badge>
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
        </div>
    );
}

