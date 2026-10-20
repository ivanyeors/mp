"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { User, Search, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { InfoTip } from "@/components/ui/info-tip";
import { customerDisplayName, type CustomerOverviewRow } from "@/lib/crm/customer-overview";
import {
    DEFAULT_CUSTOMER_FILTERS,
    customerFilterParams,
    type AccountFilter,
    type CustomerFilters,
    type CustomerSort,
    type SourceFilter,
} from "@/lib/crm/customer-filters";
import type { MigrationSummary } from "@/lib/customer-migration/overview";
import { MigrationCard } from "./migration-card";

// ─── Constants ────────────────────────────────────────────────────────────────

const LIMIT = 20;

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Exactly the JSON `GET /api/shop/customers?page=1&limit=20` returns: rows of
 * the Customer overview (`admin_customer_overview`, migration slice 12).
 */
export type CustomersListResponse = {
    ok: true;
    rows: CustomerOverviewRow[];
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
    return formatAdminDateMY(dateStr);
}

function getCustomerName(customer: CustomerOverviewRow): string {
    return customerDisplayName(customer) ?? "—";
}

/** The filters the list's URL holds; "from Shopify, no account" is one of them. */
type ListFilters = Pick<CustomerFilters, "search" | "tags" | "account" | "source" | "sort">;

/** The Account status: *Signed up* with its date, or a muted *No account*. */
function AccountStatus({ customer, compact = false }: { customer: CustomerOverviewRow; compact?: boolean }) {
    if (!customer.has_account) {
        return compact ? (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                No account
            </Badge>
        ) : (
            <span className="text-sm text-muted-foreground">No account</span>
        );
    }
    const since = formatAdminDateMY(customer.account_linked_at);
    return compact ? (
        <Badge variant="secondary" className="text-xs font-normal">
            Signed up {since}
        </Badge>
    ) : (
        <span className="text-sm">
            Signed up
            <span className="block text-xs text-muted-foreground">{since}</span>
        </span>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomersClient({
    initialData,
    initialFilters = DEFAULT_CUSTOMER_FILTERS,
    migration = null,
    canImport = false,
}: {
    initialData?: CustomersInitialData;
    /** The filters the page's URL asked for; `initialData` is page 1 of them. */
    initialFilters?: ListFilters;
    /** The Migration card's numbers, or null when they could not be read. */
    migration?: MigrationSummary | null;
    /** Holds `customer-import`; Manager and Staff do not, unless a role grants it. */
    canImport?: boolean;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    // Filter state. Search, account, source and sort live in the URL too, so
    // a filtered list can be shared (migration slice 12).
    const [search, setSearch] = useState(initialFilters.search ?? "");
    const [debouncedSearch, setDebouncedSearch] = useState(initialFilters.search ?? "");
    const [account, setAccount] = useState<AccountFilter>(initialFilters.account);
    const [source, setSource] = useState<SourceFilter>(initialFilters.source);
    const [sort, setSort] = useState<CustomerSort>(initialFilters.sort);
    // Kept from the URL as given; the list has no tag control yet (CRM slice 04).
    const [tags] = useState<string[]>(initialFilters.tags);
    const [page, setPage] = useState(1);

    // Data state
    const [customers, setCustomers] = useState<CustomerOverviewRow[]>(initialData?.customers.rows ?? []);
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

    const filtersQuery = customerFilterParams({
        search: debouncedSearch || null,
        tags,
        account,
        source,
        sort,
    }).toString();
    const filtered = account !== "all" || source !== "all" || Boolean(debouncedSearch) || tags.length > 0;

    // Keep the address bar in step without a server round trip, so the list's
    // filters survive a reload and can be shared.
    useEffect(() => {
        const url = new URL(window.location.href);
        url.search = filtersQuery;
        if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    }, [filtersQuery]);

    const changeAccount = (value: string) => {
        setAccount(value as AccountFilter);
        setPage(1);
    };
    const changeSource = (value: string) => {
        setSource(value as SourceFilter);
        setPage(1);
    };
    const changeSort = (value: string) => {
        setSort(value as CustomerSort);
        setPage(1);
    };

    // The Migration card's link: from Shopify, not signed up yet.
    const showNotSignedUp = () => {
        setAccount("no-account");
        setSource("shopify");
        setPage(1);
    };
    const notSignedUpHref = `${to("/settings/customers")}?${customerFilterParams({
        account: "no-account",
        source: "shopify",
    }).toString()}`;

    // Fetch customers
    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams(filtersQuery);
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
    }, [filtersQuery, page]);

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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
                  <InfoTip label="About Customers">
                    <p>Browse and manage your Customers.</p>
                    <p>
                        A Customer is <em>signed up</em> once they have signed in with their email at least
                        once. Until then they have <em>no account</em>, only a record from checkout or
                        the Shopify import.
                    </p>
                  </InfoTip>
                </div>
                {canImport && (
                    <Button size="sm" variant="outline" className="self-start sm:self-auto" asChild>
                        <Link href={to("/settings/customers/import")}>
                            <Upload className="mr-1.5 h-4 w-4" />
                            Import from Shopify
                        </Link>
                    </Button>
                )}
            </div>

            {migration && (
                <MigrationCard
                    summary={migration}
                    notSignedUpHref={notSignedUpHref}
                    onShowNotSignedUp={showNotSignedUp}
                />
            )}

            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input
                        placeholder="Search by name or email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <Select value={account} onValueChange={changeAccount}>
                    <SelectTrigger className="w-full sm:w-40" aria-label="Account">
                        <SelectValue placeholder="Account" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All accounts</SelectItem>
                        <SelectItem value="signed-up">Signed up</SelectItem>
                        <SelectItem value="no-account">No account</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={source} onValueChange={changeSource}>
                    <SelectTrigger className="w-full sm:w-40" aria-label="Source">
                        <SelectValue placeholder="Source" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        <SelectItem value="shopify">From Shopify</SelectItem>
                        <SelectItem value="platform">Platform</SelectItem>
                    </SelectContent>
                </Select>

                <Select value={sort} onValueChange={changeSort}>
                    <SelectTrigger className="w-full sm:w-48" aria-label="Sort">
                        <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="newest">Newest first</SelectItem>
                        <SelectItem value="oldest">Oldest first</SelectItem>
                        <SelectItem value="name-asc">Name A–Z</SelectItem>
                        <SelectItem value="name-desc">Name Z–A</SelectItem>
                        <SelectItem value="signed-up">Recently signed up</SelectItem>
                    </SelectContent>
                </Select>
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
                        {filtered
                            ? "No customers match these filters."
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
                                <TableHead className="px-4 hidden md:table-cell">Account</TableHead>
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
                                            {customer.from_shopify && (
                                                <Badge variant="outline" className="ml-2 text-xs font-normal">
                                                    Shopify
                                                </Badge>
                                            )}
                                            <span className="block text-xs text-muted-foreground mt-0.5 sm:hidden">
                                                {customer.email}
                                            </span>
                                            {/* The Account column is hidden below md: show it here instead. */}
                                            <span className="mt-1 block md:hidden">
                                                <AccountStatus customer={customer} compact />
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-4 hidden sm:table-cell text-sm text-muted-foreground">
                                            {customer.email}
                                        </TableCell>
                                        <TableCell className="px-4 hidden md:table-cell">
                                            <AccountStatus customer={customer} />
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
