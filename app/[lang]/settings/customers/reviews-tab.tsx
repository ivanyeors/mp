"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { REVIEW_TAB_SCOPES, type ReviewTabData, type ReviewTabScope, type ReviewToMatch } from "@/lib/crm/reviews";
import { FindCustomerLink, ReviewHeadline, SuggestionRow } from "./review-match-parts";

const SCOPE_LABELS: Record<ReviewTabScope, string> = {
    "to-match": "To match",
    unlinked: "All unlinked",
};

/**
 * The Customers page's Reviews tab (CRM slice 12): *Google reviews to match*.
 *
 * Google never says who wrote a review, so the CRM suggests a Customer from
 * the name and the timing of a Review request or a delivery, and a Staff
 * member decides: *Link* or *Not them* on each suggestion, or *Find
 * customer…* to link one by hand. Nothing is linked without that click.
 *
 * *To match* lists the reviews with a suggestion (what the daily Telegram
 * update counts); *All unlinked* every review nobody has linked, newest first.
 * Seeing it needs `customers`; the buttons render only for `customers-edit`.
 * The list is kept in `?scope=`.
 */
export function ReviewsTab({ canEdit, initialScope = "to-match" }: { canEdit: boolean; initialScope?: ReviewTabScope }) {
    const pathname = usePathname() ?? "/";
    const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
    const [scope, setScope] = useState<ReviewTabScope>(initialScope);
    const [page, setPage] = useState(1);
    const [data, setData] = useState<ReviewTabData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    /** Bumped by *Try again*: the same list, read again. */
    const [attempt, setAttempt] = useState(0);

    // One read per scope, page and attempt. A superseded read sets nothing; the
    // caller marks the list loading when it changes what is asked for.
    useEffect(() => {
        let current = true;
        fetch(`/api/settings/customers/google-reviews?scope=${scope}&page=${page}`)
            .then(async (res) => {
                const json = await res.json().catch(() => null);
                if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not load Google reviews.");
                if (!current) return;
                setData(json as ReviewTabData);
                setError(null);
            })
            .catch((e) => {
                if (current) setError(e instanceof Error ? e.message : "Could not load Google reviews.");
            })
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, [scope, page, attempt]);

    const goTo = (p: number) => {
        setLoading(true);
        setPage(p);
    };

    const retry = () => {
        setLoading(true);
        setAttempt((n) => n + 1);
    };

    const choose = (next: ReviewTabScope) => {
        if (next !== scope) setLoading(true);
        setScope(next);
        setPage(1);
        const url = new URL(window.location.href);
        if (next === "to-match") url.searchParams.delete("scope");
        else url.searchParams.set("scope", next);
        window.history.replaceState(null, "", url);
    };

    /** A linked review leaves both lists; a rejected suggestion leaves its review. */
    const settle = (reviewId: string, customerId: string | null) =>
        setData((d) => {
            if (!d) return d;
            const rows = d.rows.flatMap((r): ReviewToMatch[] => {
                if (r.review.id !== reviewId) return [r];
                if (customerId === null) return [];
                const suggestions = r.suggestions.filter((s) => s.customerId !== customerId);
                return d.scope === "to-match" && suggestions.length === 0 ? [] : [{ ...r, suggestions }];
            });
            const removed = d.rows.length - rows.length;
            const leftToMatch = d.rows.some((r) => r.review.id === reviewId && r.suggestions.length > 0) &&
                !rows.some((r) => r.review.id === reviewId && r.suggestions.length > 0);
            return {
                ...d,
                rows,
                total: Math.max(0, d.total - removed),
                counts: {
                    toMatch: Math.max(0, d.counts.toMatch - (leftToMatch ? 1 : 0)),
                    unlinked: Math.max(0, d.counts.unlinked - (customerId === null ? 1 : 0)),
                },
            };
        });

    const rows = data && data.scope === scope ? data.rows : [];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Which Google reviews">
                {REVIEW_TAB_SCOPES.map((s) => (
                    <Button key={s} size="sm" variant={s === scope ? "default" : "outline"} aria-pressed={s === scope} onClick={() => choose(s)}>
                        {SCOPE_LABELS[s]}
                        {data ? ` (${s === "to-match" ? data.counts.toMatch : data.counts.unlinked})` : ""}
                    </Button>
                ))}
            </div>

            <p className="text-sm text-muted-foreground">
                Google never tells us who wrote a review, so a suggestion comes from the name and when we asked or
                delivered. Nothing is linked until someone taps <em>Link</em>. A link-click is only a hint: mail scanners
                open links too.
            </p>

            {loading && !data ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : error ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{error}</span>
                    <Button size="sm" variant="ghost" onClick={retry}>
                        Try again
                    </Button>
                </div>
            ) : rows.length === 0 ? (
                <div className="rounded-xl border border-dashed p-14 text-center">
                    <Star className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
                    <p className="text-sm font-medium text-muted-foreground">
                        {scope === "to-match"
                            ? "No Google reviews are waiting to be matched."
                            : "Every Google review is linked, or none has been synced yet."}
                    </p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {rows.map(({ review, suggestions }) => (
                        <li key={review.id} className="space-y-2 rounded-xl border p-4">
                            <ReviewHeadline review={review} />
                            <p className="text-sm text-muted-foreground">
                                {review.excerpt ? <>&ldquo;{review.excerpt}&rdquo;</> : "(Rating only, no written review)"}
                            </p>
                            {suggestions.length > 0 ? (
                                <ul className="space-y-2" aria-label="Possible customers">
                                    {suggestions.map((s) => (
                                        <SuggestionRow
                                            key={s.customerId}
                                            reviewId={review.id}
                                            suggestion={s}
                                            canEdit={canEdit}
                                            customerHref={withLocale(`/settings/customers/${s.customerId}`, locale)}
                                            onDone={(result) => settle(review.id, result === "linked" ? null : s.customerId)}
                                        />
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-xs text-muted-foreground">
                                    {review.reviewerName ? "No suggested customer." : "Anonymous: never suggested."}
                                </p>
                            )}
                            {canEdit ? <FindCustomerLink reviewId={review.id} onLinked={() => settle(review.id, null)} /> : null}
                        </li>
                    ))}
                </ul>
            )}

            {data && totalPages > 1 ? (
                <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => goTo(page - 1)}>
                            Previous
                        </Button>
                        <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => goTo(page + 1)}>
                            Next
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
