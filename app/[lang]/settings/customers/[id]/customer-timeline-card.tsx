"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    BellRing,
    Clock,
    History,
    Loader2,
    RefreshCw,
    ShoppingCart,
    Sparkles,
    Star,
    StickyNote,
    Undo2,
    UserCheck,
    type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAdminDateTimeMY } from "@/lib/format/admin-date";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import type { ShownTimelineEntry, TimelineGroup } from "@/lib/crm/timeline/types";
import { cn } from "@/lib/utils";

/** Entries a phone shows at first, and how many more each *Show more* adds. */
const PHONE_STEP = 10;

/** What `GET /api/settings/customers/[id]/timeline` answers. */
type TimelinePage = {
    entries: ShownTimelineEntry[];
    next: string | null;
    groups: TimelineGroup[];
    unavailable: string[];
};

/** An icon per kind group; a group added later shows the clock until it gets one. */
const GROUP_ICONS: Record<string, LucideIcon> = {
    orders: ShoppingCart,
    results: Sparkles,
    readjustments: RefreshCw,
    returns: Undo2,
    reviews: Star,
    aftercare: BellRing,
    account: UserCheck,
    notes: StickyNote,
};

/** `no_show` → `No show`; a Paired build's `assigned · held` keeps its dot. */
function statusLabel(status: string): string {
    const spaced = status.replace(/_/g, " ");
    return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

async function fetchPage(customerId: string, before: string | null, kinds: readonly string[]): Promise<TimelinePage> {
    const qs = new URLSearchParams();
    if (before) qs.set("before", before);
    if (kinds.length) qs.set("kinds", kinds.join(","));
    const res = await fetch(`/api/settings/customers/${customerId}/timeline?${qs}`);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) throw new Error(typeof body?.error === "string" ? body.error : "Could not load the timeline");
    return body as TimelinePage;
}

type View =
    | { status: "loading" }
    | { status: "error" }
    | { status: "ready"; page: TimelinePage; filter: string };

/**
 * The Customer timeline (CONTEXT.md; ADR 0028 (b)): everything that happened
 * with this Customer, newest first, merged on the server from the tables that
 * record it. Each kind group shows only to Staff holding its source's
 * permission, so the chips are whatever the server says this viewer may see.
 * Fifty entries, then *Load older*. Read-only: nothing here writes.
 */
export function CustomerTimelineCard({ customerId }: { customerId: string }) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;

    // Empty means every group the viewer may see.
    const [selected, setSelected] = useState<string[]>([]);
    const [attempt, setAttempt] = useState(0);
    const [view, setView] = useState<View>({ status: "loading" });
    const [groups, setGroups] = useState<TimelineGroup[]>([]);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [olderError, setOlderError] = useState<string | null>(null);
    const [phoneLimit, setPhoneLimit] = useState(PHONE_STEP);

    useEffect(() => {
        let live = true;
        const filter = selected.join(",");
        fetchPage(customerId, null, selected).then(
            (page) => {
                if (!live) return;
                setView({ status: "ready", page, filter });
                setGroups(page.groups);
            },
            () => {
                if (live) setView({ status: "error" });
            },
        );
        return () => {
            live = false;
        };
    }, [customerId, selected, attempt]);

    const choose = (key: string | null) => {
        const next = key === null ? [] : selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
        setOlderError(null);
        setPhoneLimit(PHONE_STEP);
        setView({ status: "loading" });
        setSelected(next);
    };

    const retry = () => {
        setView({ status: "loading" });
        setAttempt((n) => n + 1);
    };

    const loadOlder = async () => {
        if (view.status !== "ready" || !view.page.next) return;
        const { filter } = view;
        setLoadingOlder(true);
        setOlderError(null);
        try {
            const older = await fetchPage(customerId, view.page.next, selected);
            setView((v) =>
                v.status === "ready" && v.filter === filter
                    ? {
                          ...v,
                          page: {
                              ...older,
                              entries: [...v.page.entries, ...older.entries],
                              unavailable: [...new Set([...v.page.unavailable, ...older.unavailable])],
                          },
                      }
                    : v,
            );
        } catch (e) {
            setOlderError(e instanceof Error ? e.message : "Could not load older entries");
        } finally {
            setLoadingOlder(false);
        }
    };

    return (
        <Card>
            <CardHeader className="space-y-3">
                <div>
                    <CardTitle className="text-base flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Timeline
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">Everything that happened, newest first.</p>
                </div>
                {groups.length > 1 ? (
                    // Phones: one row of chips that scrolls sideways, edge to edge of the card.
                    <div
                        className="flex gap-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 md:flex-wrap"
                        role="group"
                        aria-label="Show kinds"
                    >
                        <Button
                            type="button"
                            size="sm"
                            variant={selected.length === 0 ? "default" : "outline"}
                            aria-pressed={selected.length === 0}
                            className="h-7 shrink-0 rounded-full px-3 text-xs"
                            onClick={() => choose(null)}
                        >
                            All
                        </Button>
                        {groups.map((g) => (
                            <Button
                                key={g.key}
                                type="button"
                                size="sm"
                                variant={selected.includes(g.key) ? "default" : "outline"}
                                aria-pressed={selected.includes(g.key)}
                                className="h-7 shrink-0 rounded-full px-3 text-xs"
                                onClick={() => choose(g.key)}
                            >
                                {g.label}
                            </Button>
                        ))}
                    </div>
                ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
                {view.status === "loading" ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : view.status === "error" ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>Could not load the timeline.</span>
                        <Button size="sm" variant="ghost" onClick={retry}>
                            Try again
                        </Button>
                    </div>
                ) : (
                    <>
                        {view.page.unavailable.length ? (
                            <p className="text-xs text-muted-foreground">
                                Could not load {view.page.unavailable.join(", ")} this time; the rest is shown.
                            </p>
                        ) : null}
                        {view.page.entries.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Nothing here yet.</p>
                        ) : (
                            <ul className="space-y-3 max-md:space-y-1">
                                {view.page.entries.map((entry, index) => {
                                    const Icon = GROUP_ICONS[entry.group] ?? Clock;
                                    return (
                                        // A linked entry is one target on a phone: its link
                                        // stretches over the row (max-md:after:inset-0).
                                        <li
                                            key={entry.id}
                                            className={cn(
                                                "flex gap-3 text-sm max-md:relative max-md:-mx-2 max-md:min-h-11 max-md:rounded-md max-md:px-2 max-md:py-1.5",
                                                entry.ref.href && "max-md:transition-colors max-md:has-[a:active]:bg-press",
                                                index >= phoneLimit && "max-md:hidden",
                                            )}
                                        >
                                            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-muted/40 text-muted-foreground">
                                                <Icon className="h-3.5 w-3.5" />
                                            </span>
                                            <div className="min-w-0 flex-1 space-y-0.5">
                                                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                                                    {entry.ref.href ? (
                                                        <Link
                                                            href={withLocale(entry.ref.href, locale)}
                                                            className="font-medium text-primary hover:underline break-words md:active:opacity-60 max-md:after:absolute max-md:after:inset-0 max-md:after:content-['']"
                                                        >
                                                            {entry.summary}
                                                        </Link>
                                                    ) : (
                                                        <span className="font-medium break-words">{entry.summary}</span>
                                                    )}
                                                    {entry.status ? (
                                                        <Badge variant="outline" className="text-xs">
                                                            {statusLabel(entry.status)}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatAdminDateTimeMY(entry.at)}
                                                </p>
                                                {entry.detail ? (
                                                    <p className="whitespace-pre-wrap break-words text-muted-foreground">
                                                        {entry.detail}
                                                    </p>
                                                ) : null}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {view.page.entries.length > phoneLimit ? (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full md:hidden"
                                onClick={() => setPhoneLimit((n) => n + PHONE_STEP)}
                            >
                                Show more
                            </Button>
                        ) : null}
                        {olderError ? <p className="text-xs text-destructive">{olderError}</p> : null}
                        {view.page.next ? (
                            <Button
                                variant="outline"
                                size="sm"
                                // On a phone, Show more first walks through what is already loaded.
                                className={cn("w-full", view.page.entries.length > phoneLimit && "max-md:hidden")}
                                onClick={() => void loadOlder()}
                                disabled={loadingOlder}
                            >
                                {loadingOlder ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Load older
                            </Button>
                        ) : null}
                    </>
                )}
            </CardContent>
        </Card>
    );
}
