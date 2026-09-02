"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import type { Customer } from "@/lib/types/ecommerce";

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

/** Exactly the JSON `GET /api/shop/customers?page=1&limit=20` returns. */
export type CustomersListResponse = {
    ok: true;
    rows: Customer[];
    total: number;
    page: number;
    limit: number;
};

export type CustomersInitialData = {
    customers: CustomersListResponse;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSGD(amount: number): string {
    return new Intl.NumberFormat("en-SG", {
        style: "currency",
        currency: "SGD",
    }).format(amount);
}

function formatDate(dateStr: string): string {
    return new Intl.DateTimeFormat("en-MY", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(dateStr));
}

function getCustomerName(customer: Customer): string {
    const parts = [customer.first_name, customer.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "—";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomersClient({ initialData }: { initialData?: CustomersInitialData }) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    // Filter state
    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [page, setPage] = useState(1);

    // Data state
    const [customers, setCustomers] = useState<Customer[]>(initialData?.customers.rows ?? []);
    const [total, setTotal] = useState(initialData?.customers.total ?? 0);
    const [loading, setLoading] = useState(!initialData);

    // The RSC page already fetched page 1 — skip the mount fetch once.
    const hydratedFromServer = useRef(Boolean(initialData));

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

    // Fetch customers
    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (debouncedSearch) params.set("search", debouncedSearch);
        params.set("page", String(page));
        params.set("limit", String(LIMIT));

        try {
            const res = await fetch(`/api/shop/customers?${params.toString()}`);
            const json = await res.json();
            setCustomers(json.rows ?? []);
            setTotal(json.total ?? 0);
        } catch {
            setCustomers([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [debouncedSearch, page]);

    useEffect(() => {
        if (hydratedFromServer.current) {
            hydratedFromServer.current = false;
            return;
        }
        fetchCustomers();
    }, [fetchCustomers]);

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
                <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
                <p className="text-muted-foreground mt-1 text-sm">
                    Browse and manage your customer accounts.
                </p>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : customers.length === 0 ? (
                <div className="rounded-xl border border-dashed p-14 text-center">
                    <User className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                        {debouncedSearch
                            ? "No customers match your search."
                            : "No customers yet."}
                    </p>
                </div>
            ) : (
                <div className="rounded-xl border overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4">Name</TableHead>
                                <TableHead className="px-4 hidden sm:table-cell">Email</TableHead>
                                <TableHead className="px-4 text-right hidden md:table-cell">
                                    Orders
                                </TableHead>
                                <TableHead className="px-4 text-right hidden md:table-cell">
                                    Total Spent
                                </TableHead>
                                <TableHead className="px-4 hidden lg:table-cell">Tags</TableHead>
                                <TableHead className="px-4 hidden xl:table-cell">Joined</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {customers.map((customer) => {
                                const name = getCustomerName(customer);
                                return (
                                    <TableRow
                                        key={customer.id}
                                        className="cursor-pointer transition-colors"
                                        onClick={() =>
                                            router.push(to(`/settings/customers/${customer.id}`))
                                        }
                                    >
                                        <TableCell className="px-4 py-3">
                                            <span className="font-medium">{name}</span>
                                            <span className="block text-xs text-muted-foreground mt-0.5 sm:hidden">
                                                {customer.email}
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-4 hidden sm:table-cell text-sm text-muted-foreground">
                                            {customer.email}
                                        </TableCell>
                                        <TableCell className="px-4 text-right hidden md:table-cell text-sm">
                                            {customer.total_orders}
                                        </TableCell>
                                        <TableCell className="px-4 text-right hidden md:table-cell text-sm font-medium">
                                            {formatSGD(customer.total_spent)}
                                        </TableCell>
                                        <TableCell className="px-4 hidden lg:table-cell">
                                            <div className="flex flex-wrap gap-1">
                                                {(customer.tags ?? []).slice(0, 3).map((tag) => (
                                                    <Badge
                                                        key={tag}
                                                        variant="secondary"
                                                        className="text-xs"
                                                    >
                                                        {tag}
                                                    </Badge>
                                                ))}
                                                {(customer.tags ?? []).length > 3 && (
                                                    <Badge
                                                        variant="outline"
                                                        className="text-xs"
                                                    >
                                                        +{customer.tags.length - 3}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        {/* Formatted in the viewer's timezone, which the server render cannot know. */}
                                        <TableCell
                                            className="px-4 hidden xl:table-cell text-sm text-muted-foreground"
                                            suppressHydrationWarning
                                        >
                                            {formatDate(customer.created_at)}
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
                <div className="flex min-w-0 flex-col items-center gap-2 overflow-x-auto sm:flex-row sm:flex-wrap sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, total)} of{" "}
                        {total} customer{total !== 1 ? "s" : ""}
                    </p>
                    <Pagination className="mx-0 w-auto max-w-full">
                        <PaginationContent className="flex-wrap justify-center">
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
