"use client";

import { useEffect, useId, useState, useCallback, useRef, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User, Search, Loader2, Mail, SlidersHorizontal, Smartphone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { MobileList, MobileListRow } from "@/components/settings/mobile-list";
import { EmptyState } from "@/components/settings/empty-state";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { formatAdminDateMY } from "@/lib/format/admin-date";
import { customerDisplayName, type CustomerOverviewRow } from "@/lib/crm/customer-overview";
import {
    CUSTOMER_FILTER_KEYS,
    CUSTOMER_FILTER_PARAMS,
    DEFAULT_CUSTOMER_FILTERS,
    clearCustomerFilter,
    clearCustomerFilters,
    customerFilterParams,
    isCustomerFilterActive,
    type CustomerFilterKey,
    type CustomerFilterParam,
    type CustomerListFilters,
    type CustomerSort,
} from "@/lib/crm/customer-filters";
import type { MigrationSummary } from "@/lib/customer-migration/overview";
import { reviewFacts } from "@/lib/crm/reviews";
import {
    chosenSegmentFilters,
    sameSegmentFilters,
    segmentParams,
    type CustomerSegment,
} from "@/lib/crm/segment-rules";
import { CustomerFilterSummary, CustomerMegaFilter, MEGA_FILTER_KEYS } from "./customer-filters-panel";
import { LifecycleStageBadge, LifecycleStageCell, lifecycleNote } from "./lifecycle-stage-badge";
import { MigrationCard } from "./migration-card";
import { SegmentsRow } from "./segments-row";
import type { CampaignFilterOption } from "@/lib/email-campaigns/store";

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
    /** With *Ships to* Singapore or elsewhere: how many more ship to an unknown country (slice 05). */
    shipsToUnknown?: number | null;
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

function formatDate(dateStr: string | null): string {
    return formatAdminDateMY(dateStr);
}

function getCustomerName(customer: CustomerOverviewRow): string {
    return customerDisplayName(customer) ?? "—";
}

/**
 * The Review column (CRM slice 12): the strongest fact first (*★5 Google*,
 * *★4 shop (2)*, *Asked 3 Nov · clicked*, *Asked 3 Nov*), then the rest,
 * muted. *—* with none. A Google review counts only once Staff have linked it.
 */
function ReviewCell({ customer }: { customer: CustomerOverviewRow }) {
    const [first, ...rest] = reviewFacts(customer);
    if (!first) return <span className="text-sm text-muted-foreground">—</span>;
    return (
        <span className="text-sm whitespace-nowrap">
            {first}
            {rest.length > 0 && <span className="block text-xs text-muted-foreground">{rest.join(", ")}</span>}
        </span>
    );
}

/**
 * Contact status as small marks (CRM slice 11): how they sign in (an envelope
 * for the emailed code, G for Google) and a phone when a valid number is on
 * file. Each says what it means to a screen reader and on hover.
 */
function ContactMarks({ customer }: { customer: CustomerOverviewRow }) {
    const providers = customer.account_providers ?? [];
    const marks: { key: string; label: string; mark: ReactNode }[] = [];
    if (providers.includes("email")) {
        marks.push({ key: "email", label: "Signs in with an email code", mark: <Mail className="h-3.5 w-3.5" /> });
    }
    if (providers.includes("google")) {
        marks.push({ key: "google", label: "Signs in with Google", mark: <span className="text-xs font-bold leading-none">G</span> });
    }
    if (customer.phone_valid) {
        marks.push({ key: "mobile", label: "Valid number on file", mark: <Smartphone className="h-3.5 w-3.5" /> });
    }
    if (marks.length === 0) return null;
    return (
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {marks.map((m) => (
                <span key={m.key} role="img" aria-label={m.label} title={m.label} className="inline-flex items-center">
                    {m.mark}
                </span>
            ))}
        </span>
    );
}

/** The Account status: *Signed up* with its date, or a muted *No account*, then the Contact marks. */
function AccountStatus({ customer, compact = false }: { customer: CustomerOverviewRow; compact?: boolean }) {
    if (!customer.has_account) {
        return compact ? (
            <span className="inline-flex items-center gap-2">
                <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                    No account
                </Badge>
                <ContactMarks customer={customer} />
            </span>
        ) : (
            <span className="text-sm text-muted-foreground">
                No account
                <span className="block">
                    <ContactMarks customer={customer} />
                </span>
            </span>
        );
    }
    const since = formatAdminDateMY(customer.account_linked_at);
    return compact ? (
        <span className="inline-flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-normal">
                Signed up {since}
            </Badge>
            <ContactMarks customer={customer} />
        </span>
    ) : (
        <span className="text-sm">
            Signed up
            <span className="block text-xs text-muted-foreground">{since}</span>
            <span className="block">
                <ContactMarks customer={customer} />
            </span>
        </span>
    );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomersClient({
    initialData,
    initialFilters,
    ignoredFilters = [],
    migration = null,
    initialSegments,
    campaigns = [],
    canEdit = false,
    canEmail = false,
}: {
    initialData?: CustomersInitialData;
    /** The filters the page's URL asked for; `initialData` is page 1 of them. */
    initialFilters?: Partial<CustomerListFilters>;
    /** URL parameters the page dropped as invalid; the list says so. */
    ignoredFilters?: readonly CustomerFilterParam[];
    /** The Migration card's numbers, or null when they could not be read. */
    migration?: MigrationSummary | null;
    /** The Segments row (CRM slice 05), read by the page; undefined and the row fetches them. */
    initialSegments?: CustomerSegment[];
    /** The *Campaign* filter's choices (PRD-campaign-audiences slice 05), latest started first. */
    campaigns?: readonly CampaignFilterOption[];
    /** `customers-edit`: saving, updating, renaming and archiving Segments. */
    canEdit?: boolean;
    /** `campaigns`: *Email this Segment* (PRD-crm-retention-loop slice 02). */
    canEmail?: boolean;
}) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const to = (href: string) => withLocale(href, locale);
    const router = useRouter();

    // Filter state: one object, read through the list's one schema
    // (lib/crm/customer-filters.ts). All of it lives in the URL too, so a
    // filtered list can be shared (migration slice 12, CRM slice 04). Search
    // is typed into `search` and reaches `filters` once typing pauses.
    // Paging is the list's own `page` state; any page or limit in here is unused.
    const [filters, setFilters] = useState<CustomerListFilters>(() => ({ ...DEFAULT_CUSTOMER_FILTERS, ...initialFilters }));
    const [search, setSearch] = useState(filters.search ?? "");
    const [page, setPage] = useState(1);
    // The mega filter starts closed: it opens over the list, and the chips
    // above the list already say what a link has set.
    const [panelOpen, setPanelOpen] = useState(false);
    // The Segment chosen on this list (CRM slice 05): a Segment's own link
    // opens with it chosen, so changing a filter offers *Update {name}*.
    const [segmentId, setSegmentId] = useState<string | null>(() => {
        const now = segmentParams(filters);
        if (!Object.keys(now).length) return null;
        return initialSegments?.find((s) => sameSegmentFilters(s.params, now))?.id ?? null;
    });

    // Data state
    const [customers, setCustomers] = useState<CustomerOverviewRow[]>(initialData?.customers.rows ?? []);
    const [total, setTotal] = useState(initialData?.customers.total ?? 0);
    const [shipsToUnknown, setShipsToUnknown] = useState<number | null>(initialData?.customers.shipsToUnknown ?? null);
    const [loading, setLoading] = useState(!initialData);

    // The RSC page already fetched page 1 — skip the mount fetch once.
    const hydratedFromServer = useRef(Boolean(initialData));

    /** Every change to the filters starts again at page 1. */
    const applyFilters = (next: (f: CustomerListFilters) => CustomerListFilters) => {
        setFilters(next);
        setPage(1);
    };
    const changeFilters = (patch: Partial<CustomerListFilters>) => applyFilters((f) => ({ ...f, ...patch }));

    // Debounce search
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const next = search.trim() || null;
            setFilters((f) => (f.search === next ? f : { ...f, search: next }));
            setPage(1);
        }, 350);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [search]);

    const filtersQuery = customerFilterParams(filters).toString();
    const panelCount = MEGA_FILTER_KEYS.filter((k) => isCustomerFilterActive(filters, k)).length;
    const filtered = CUSTOMER_FILTER_KEYS.some((k) => isCustomerFilterActive(filters, k));

    // Keep the address bar in step without a server round trip, so the list's
    // filters survive a reload and can be shared. Only the filters' own keys
    // are rewritten: `?view=` belongs to CustomersPageTabs.
    useEffect(() => {
        const url = new URL(window.location.href);
        for (const key of CUSTOMER_FILTER_PARAMS) url.searchParams.delete(key);
        new URLSearchParams(filtersQuery).forEach((value, key) => url.searchParams.set(key, value));
        if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    }, [filtersQuery]);

    const changeSort = (value: string) => changeFilters({ sort: value as CustomerSort });

    // The summary's × and Clear all. Search is also the box's text.
    const clearFilter = (key: CustomerFilterKey) => {
        if (key === "search") setSearch("");
        applyFilters((f) => clearCustomerFilter(f, key));
    };
    // The mega filter's *Clear filters*: its own filters, not the search or the sort.
    const clearMegaFilters = () => applyFilters((f) => MEGA_FILTER_KEYS.reduce((acc, k) => clearCustomerFilter(acc, k), f));
    const clearAll = () => {
        setSearch("");
        setSegmentId(null);
        applyFilters(clearCustomerFilters);
    };

    // Choosing a Segment puts exactly its filters on the list, and in the URL;
    // the list keeps its sort.
    const chooseSegment = (segment: CustomerSegment) => {
        setSearch(segment.params.search ?? "");
        setSegmentId(segment.id);
        applyFilters((f) => ({ ...f, ...chosenSegmentFilters(segment.params) }));
    };

    // The Migration card's link: from Shopify, not signed up yet.
    const showNotSignedUp = () => changeFilters({ account: "no-account", source: "shopify" });
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
            setShipsToUnknown(typeof json.shipsToUnknown === "number" ? json.shipsToUnknown : null);
        } catch {
            setCustomers([]);
            setTotal(0);
            setShipsToUnknown(null);
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

    // In the toolbar from md; on a phone, at the top of the mega filter, labelled.
    const sortId = useId();
    const sortSelect = (id?: string) => (
        <Select value={filters.sort} onValueChange={changeSort}>
            <SelectTrigger id={id} className="w-full min-w-0 md:w-48" aria-label="Sort">
                <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name-asc">Name A to Z</SelectItem>
                <SelectItem value="name-desc">Name Z to A</SelectItem>
                <SelectItem value="signed-up">Recently signed up</SelectItem>
                <SelectItem value="last-order">Last order</SelectItem>
                <SelectItem value="spend">Most spent</SelectItem>
            </SelectContent>
        </Select>
    );

    return (
        <div className="space-y-4 md:space-y-6">
            {/* The page header and tabs are CustomersPageTabs'; this is the list tab. */}
            {migration && (
                <MigrationCard
                    summary={migration}
                    notSignedUpHref={notSignedUpHref}
                    onShowNotSignedUp={showNotSignedUp}
                />
            )}

            <SegmentsRow
                initialSegments={initialSegments}
                canEdit={canEdit}
                newCampaignPath={canEmail ? to("/settings/campaigns/new") : undefined}
                params={segmentParams(filters)}
                activeId={segmentId}
                listPath={to("/settings/customers")}
                onChoose={chooseSegment}
                onSelect={setSegmentId}
            />

            {/* Toolbar: search, the sort and the mega filter's button; on a phone, search and Filters. */}
            <CustomerMegaFilter
                open={panelOpen}
                onOpenChange={setPanelOpen}
                filters={filters}
                onChange={changeFilters}
                onClearFilters={clearMegaFilters}
                campaigns={campaigns}
                total={loading ? null : total}
                trigger={
                    <Button type="button" variant={panelOpen ? "secondary" : "outline"} className="shrink-0">
                        <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                        Filters
                        {panelCount > 0 && (
                            <Badge className="ml-1.5 h-5 min-w-5 rounded-full px-1.5 text-xs">{panelCount}</Badge>
                        )}
                    </Button>
                }
                toolbar={(trigger) => (
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="relative min-w-0 flex-1 md:max-w-sm">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Search by name or email…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <div className="ml-auto hidden md:block">{sortSelect()}</div>
                        {trigger}
                    </div>
                )}
                phoneExtra={
                    <div className="space-y-2">
                        <Label htmlFor={sortId}>Sort</Label>
                        {sortSelect(sortId)}
                    </div>
                }
            />

            <CustomerFilterSummary
                filters={filters}
                ignored={ignoredFilters}
                campaigns={campaigns}
                shipsToUnknown={loading ? null : shipsToUnknown}
                onClear={clearFilter}
                onClearAll={clearAll}
            />

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-12 md:py-24">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : customers.length === 0 ? (
                <EmptyState icon={User}>
                    {filtered ? "No customers match these filters." : "No customers yet."}
                </EmptyState>
            ) : (
                <>
                <MobileList>
                    {customers.map((customer) => {
                        const note = lifecycleNote(customer);
                        return (
                            <MobileListRow key={customer.id} href={to(`/settings/customers/${customer.id}`)}>
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="min-w-0 truncate font-medium">{getCustomerName(customer)}</span>
                                    {customer.from_shopify && (
                                        <Badge variant="outline" className="text-xs font-normal">
                                            Shopify
                                        </Badge>
                                    )}
                                    {customer.open_followups > 0 && (
                                        <Badge variant="secondary" className="text-xs font-normal">
                                            {customer.open_followups} to follow up
                                        </Badge>
                                    )}
                                </div>
                                <p className="truncate text-xs text-muted-foreground">{customer.email}</p>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <LifecycleStageBadge
                                        stage={customer.lifecycle_stage}
                                        undated={customer.lifecycle_undated}
                                    />
                                    {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
                                    <AccountStatus customer={customer} compact />
                                </div>
                            </MobileListRow>
                        );
                    })}
                </MobileList>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="px-4">Name</TableHead>
                                <TableHead className="px-4 hidden sm:table-cell">Email</TableHead>
                                <TableHead className="px-4 hidden md:table-cell">Stage</TableHead>
                                <TableHead className="px-4 hidden md:table-cell">Account</TableHead>
                                <TableHead className="px-4 text-right hidden md:table-cell">
                                    Orders
                                </TableHead>
                                <TableHead className="px-4 text-right hidden md:table-cell">
                                    Total spent
                                </TableHead>
                                <TableHead className="px-4 hidden lg:table-cell">Last order</TableHead>
                                <TableHead className="px-4 hidden lg:table-cell">Review</TableHead>
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
                                            {customer.open_followups > 0 && (
                                                <Badge
                                                    variant="secondary"
                                                    className="ml-2 text-xs font-normal"
                                                    title={`${customer.open_followups} open follow-up${customer.open_followups === 1 ? "" : "s"}`}
                                                >
                                                    {customer.open_followups} to follow up
                                                </Badge>
                                            )}
                                            <span className="block text-xs text-muted-foreground mt-0.5 sm:hidden">
                                                {customer.email}
                                            </span>
                                            {/* The Stage and Account columns are hidden below md: show them here instead. */}
                                            <span className="mt-1 flex flex-wrap items-center gap-2 md:hidden">
                                                <LifecycleStageBadge
                                                    stage={customer.lifecycle_stage}
                                                    undated={customer.lifecycle_undated}
                                                />
                                                {lifecycleNote(customer) ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        {lifecycleNote(customer)}
                                                    </span>
                                                ) : null}
                                                <AccountStatus customer={customer} compact />
                                            </span>
                                        </TableCell>
                                        <TableCell className="px-4 hidden sm:table-cell text-sm text-muted-foreground">
                                            {customer.email}
                                        </TableCell>
                                        <TableCell className="px-4 hidden md:table-cell">
                                            <LifecycleStageCell customer={customer} />
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
                                        {/* Formatted in the viewer's timezone, which the server render cannot know. */}
                                        <TableCell
                                            className="px-4 hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap"
                                            suppressHydrationWarning
                                        >
                                            {formatDate(customer.last_purchase_at)}
                                        </TableCell>
                                        {/* Dates in Singapore time, so the server render and the browser agree. */}
                                        <TableCell className="px-4 hidden lg:table-cell">
                                            <ReviewCell customer={customer} />
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
                </>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex min-w-0 flex-col items-center gap-2 overflow-x-auto sm:flex-row sm:flex-wrap sm:justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {(page - 1) * LIMIT + 1} to {Math.min(page * LIMIT, total)} of{" "}
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
