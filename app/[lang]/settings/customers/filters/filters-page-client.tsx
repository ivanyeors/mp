"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MobileStickyActionBar, mobileStickyActionBarSpacerClassName } from "@/components/ui/mobile-sticky-action-bar";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import {
    CUSTOMER_FILTER_PARAMS,
    DEFAULT_CUSTOMER_FILTERS,
    clearCustomerFilter,
    clearCustomerFilters,
    customerFilterParams,
    isCustomerFilterActive,
    type CustomerFilterKey,
    type CustomerFilterParam,
    type CustomerListFilters,
} from "@/lib/crm/customer-filters";
import type { CampaignFilterOption } from "@/lib/email-campaigns/store";
import { cn } from "@/lib/utils";
import {
    CUSTOMER_FILTER_GROUPS,
    CustomerFilterGroup,
    CustomerFilterSummary,
    CustomerSortSelect,
    MEGA_FILTER_KEYS,
    groupFilterCount,
    shipsToUnknownNote,
    showCustomersLabel,
    type CustomerFilterGroupId,
} from "../customer-filters-panel";

/** What the list holds with the filters: its total, and with *Ships to*, how many more are Unknown. */
export type FilterCount = { total: number; shipsToUnknown: number | null };

/**
 * The mega filter, a page of its own (/settings/customers/filters). Every group
 * is laid out at once, each a section; from md an index beside them jumps to
 * each and says how many of its filters are set. Each change applies at once:
 * the URL follows, and the count above (below, on a phone) says how many
 * customers match. *Show N customers* opens the list with these filters.
 */
export function CustomerFiltersPageClient({
    initialFilters,
    ignoredFilters = [],
    campaigns = [],
    initialCount,
}: {
    initialFilters: Partial<CustomerListFilters>;
    ignoredFilters?: readonly CustomerFilterParam[];
    campaigns?: readonly CampaignFilterOption[];
    /** Read by the page for the first paint; null when that read failed. */
    initialCount: FilterCount | null;
}) {
    const pathname = usePathname() ?? "";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const sortId = useId();

    const [filters, setFilters] = useState<CustomerListFilters>(() => ({ ...DEFAULT_CUSTOMER_FILTERS, ...initialFilters }));
    const [count, setCount] = useState<FilterCount | null>(initialCount);
    const [counting, setCounting] = useState(initialCount == null);
    const [active, setActive] = useState<CustomerFilterGroupId>("stage");

    const filtersQuery = customerFilterParams(filters).toString();
    const listHref = withLocale(`/settings/customers${filtersQuery ? `?${filtersQuery}` : ""}`, locale);
    const set = MEGA_FILTER_KEYS.filter((k) => isCustomerFilterActive(filters, k)).length;

    const changeFilters = (patch: Partial<CustomerListFilters>) => setFilters((f) => ({ ...f, ...patch }));
    const clearOne = (key: CustomerFilterKey) => setFilters((f) => clearCustomerFilter(f, key));
    const clearAll = () => setFilters(clearCustomerFilters);

    // The address bar follows, so this page can be shared and the list's Back returns here as left.
    useEffect(() => {
        const url = new URL(window.location.href);
        for (const key of CUSTOMER_FILTER_PARAMS) url.searchParams.delete(key);
        new URLSearchParams(filtersQuery).forEach((value, key) => url.searchParams.set(key, value));
        if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    }, [filtersQuery]);

    // The count, once the filters settle: one row of the list's own read.
    const counted = useRef(initialCount ? filtersQuery : null);
    useEffect(() => {
        if (counted.current === filtersQuery) return;
        const abort = new AbortController();
        const timer = setTimeout(async () => {
            setCounting(true);
            try {
                const res = await fetch(`/api/shop/customers?${filtersQuery}${filtersQuery ? "&" : ""}page=1&limit=1`, {
                    signal: abort.signal,
                });
                const json = (await res.json()) as Partial<FilterCount> & { ok?: boolean };
                if (!res.ok || typeof json.total !== "number") throw new Error("count failed");
                counted.current = filtersQuery;
                setCount({ total: json.total, shipsToUnknown: json.shipsToUnknown ?? null });
            } catch {
                if (!abort.signal.aborted) setCount(null);
            } finally {
                if (!abort.signal.aborted) setCounting(false);
            }
        }, 250);
        return () => {
            abort.abort();
            clearTimeout(timer);
        };
    }, [filtersQuery]);

    // The index marks the section in view.
    useEffect(() => {
        if (typeof IntersectionObserver === "undefined") return;
        const sections = CUSTOMER_FILTER_GROUPS.map((g) => document.getElementById(`filters-${g.id}`)).filter(
            (el): el is HTMLElement => el != null,
        );
        const observer = new IntersectionObserver(
            (entries) => {
                const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                const first = seen[0]?.target.id.replace(/^filters-/, "");
                if (first) setActive(first as CustomerFilterGroupId);
            },
            { rootMargin: "-80px 0px -55% 0px" },
        );
        sections.forEach((el) => observer.observe(el));
        return () => observer.disconnect();
    }, []);

    const unknown = count ? shipsToUnknownNote(filters, count.shipsToUnknown) : null;
    const countText = counting ? "Counting…" : count ? `${count.total.toLocaleString("en-SG")} ${count.total === 1 ? "customer matches" : "customers match"}` : "The count could not be read.";
    const showLabel = counting || !count ? "Show customers" : showCustomersLabel(count.total);

    const actions = (
        <>
            <Button type="button" variant="ghost" onClick={clearAll} disabled={set === 0 && !filters.search}>
                Clear all
            </Button>
            <Button asChild>
                <Link href={listHref}>
                    {counting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                    {showLabel}
                </Link>
            </Button>
        </>
    );

    return (
        <div className={cn("space-y-4 md:space-y-6", mobileStickyActionBarSpacerClassName)}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <Button variant="ghost" size="sm" className="self-start max-md:hidden" asChild>
                    <Link href={listHref}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Customers
                    </Link>
                </Button>
                <div className="min-w-0">
                    <h1 className="text-2xl font-semibold tracking-tight">Filters</h1>
                    <p className="text-sm text-muted-foreground">
                        Choose who the Customers list shows. To keep a set, save it as a Segment from the list.
                    </p>
                </div>
            </div>

            {/* From md the count and the way back stay in view while the groups scroll. */}
            <div
                role="status"
                className="sticky top-0 z-20 -mx-1 hidden items-center justify-between gap-4 border-b bg-background/95 px-1 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:flex"
            >
                <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums">{countText}</p>
                    {unknown && <p className="text-xs text-muted-foreground">{unknown}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">{actions}</div>
            </div>

            <CustomerFilterSummary
                filters={filters}
                ignored={ignoredFilters}
                campaigns={campaigns}
                onClear={clearOne}
            />

            {/* The sort sits in the list's toolbar from md; a phone's toolbar has no room. */}
            <div className="space-y-2 md:hidden">
                <Label htmlFor={sortId}>Sort</Label>
                <CustomerSortSelect id={sortId} value={filters.sort} onChange={(sort) => changeFilters({ sort })} />
            </div>

            <div className="md:grid md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
                <nav aria-label="Filter groups" className="hidden md:block">
                    <ul className="sticky top-24 space-y-0.5">
                        {CUSTOMER_FILTER_GROUPS.map((g) => {
                            const n = groupFilterCount(filters, g);
                            const current = g.id === active;
                            return (
                                <li key={g.id}>
                                    <a
                                        href={`#filters-${g.id}`}
                                        aria-current={current ? "location" : undefined}
                                        onClick={() => setActive(g.id)}
                                        className={cn(
                                            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted active:bg-press",
                                            current ? "bg-muted font-medium" : "text-muted-foreground",
                                        )}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{g.label}</span>
                                        {n > 0 && (
                                            <Badge className="h-5 min-w-5 shrink-0 rounded-full px-1.5 text-xs" aria-label={`${n} set`}>
                                                {n}
                                            </Badge>
                                        )}
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="min-w-0 space-y-4 md:space-y-6">
                    {CUSTOMER_FILTER_GROUPS.map((g) => {
                        const n = groupFilterCount(filters, g);
                        return (
                            <section
                                key={g.id}
                                id={`filters-${g.id}`}
                                aria-labelledby={`filters-${g.id}-title`}
                                className="@container min-w-0 scroll-mt-24 rounded-xl border p-4 md:p-5"
                            >
                                <div className="mb-4 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h2 id={`filters-${g.id}-title`} className="text-base font-semibold">
                                            {g.label}
                                        </h2>
                                        <p className="text-sm text-muted-foreground">{g.blurb}</p>
                                    </div>
                                    {n > 0 && (
                                        <Badge variant="secondary" className="shrink-0">
                                            {n} set
                                        </Badge>
                                    )}
                                </div>
                                <CustomerFilterGroup group={g.id} filters={filters} onChange={changeFilters} campaigns={campaigns} />
                            </section>
                        );
                    })}
                </div>
            </div>

            <MobileStickyActionBar className="space-y-2">
                <p role="status" className="text-center text-xs text-muted-foreground tabular-nums">
                    {countText}
                </p>
                <div className="flex items-center justify-between gap-3">{actions}</div>
            </MobileStickyActionBar>
        </div>
    );
}
