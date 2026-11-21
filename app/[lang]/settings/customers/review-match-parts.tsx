"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CustomerOverviewRow } from "@/lib/crm/customer-overview";
import {
    GOOGLE_REPLY_LABELS,
    reviewDate,
    reviewerLabel,
    stars,
    type CurrentGoogleReviewLink,
    type GoogleReviewSummary,
    type ReviewSuggestionView,
} from "@/lib/crm/reviews";

const base = (reviewId: string) => `/api/settings/customers/google-reviews/${reviewId}`;

async function readError(res: Response, fallback: string): Promise<{ error: string; current?: CurrentGoogleReviewLink }> {
    const payload = await res.json().catch(() => null);
    return {
        error: typeof payload?.error === "string" ? payload.error : fallback,
        current: payload?.current ?? undefined,
    };
}

function heldBy(current: CurrentGoogleReviewLink | undefined): string {
    if (!current) return "";
    const who = current.name ?? current.email ?? "another customer";
    return ` It is linked to ${who}${current.email && current.name ? ` (${current.email})` : ""} since ${reviewDate(current.linkedAt)}.`;
}

export async function linkReview(reviewId: string, customerId: string, how: "suggestion" | "manual"): Promise<boolean> {
    const res = await fetch(`${base(reviewId)}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, how }),
    });
    if (res.ok) {
        toast.success("Google review linked.");
        return true;
    }
    const { error, current } = await readError(res, "Could not link the review.");
    toast.error(`${error}${heldBy(current)}`);
    return false;
}

export async function rejectMatch(reviewId: string, customerId: string): Promise<boolean> {
    const res = await fetch(`${base(reviewId)}/rejections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
    });
    if (res.ok) return true;
    toast.error((await readError(res, "Could not save that.")).error);
    return false;
}

export async function unlinkReview(reviewId: string, customerId: string): Promise<boolean> {
    const res = await fetch(`${base(reviewId)}/link`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId }),
    });
    if (res.ok) {
        toast.success("Unlinked. They won't be suggested for this review again.");
        return true;
    }
    toast.error((await readError(res, "Could not unlink the review.")).error);
    return false;
}

export function ReviewHeadline({ review }: { review: GoogleReviewSummary }) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-semibold" aria-label={review.rating ? `${review.rating} stars` : "No star rating"}>
                {stars(review.rating)}
            </span>
            <span className="font-medium">
                {review.reviewerName ? <>&ldquo;{review.reviewerName}&rdquo;</> : reviewerLabel(review)}
            </span>
            <span className="text-muted-foreground" suppressHydrationWarning>
                {reviewDate(review.reviewedAt)}
            </span>
            <Badge variant="outline" className="text-xs font-normal">
                {GOOGLE_REPLY_LABELS[review.reply]}
            </Badge>
        </div>
    );
}

export function SuggestionRow({
    reviewId,
    suggestion,
    canEdit,
    customerHref,
    onDone,
}: {
    reviewId: string;
    suggestion: ReviewSuggestionView;
    canEdit: boolean;
    customerHref: string;
    onDone: (result: "linked" | "rejected") => void;
}) {
    const [busy, setBusy] = useState<"link" | "reject" | null>(null);
    const run = async (what: "link" | "reject") => {
        setBusy(what);
        try {
            if (what === "link" ? await linkReview(reviewId, suggestion.customerId, "suggestion") : await rejectMatch(reviewId, suggestion.customerId)) {
                onDone(what === "link" ? "linked" : "rejected");
            }
        } finally {
            setBusy(null);
        }
    };
    return (
        <li className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
                <Link href={customerHref} className="font-medium text-primary hover:underline">
                    {suggestion.name ?? suggestion.email ?? "Customer"}
                </Link>
                {suggestion.name && suggestion.email ? (
                    <span className="ml-1.5 break-all text-xs text-muted-foreground">{suggestion.email}</span>
                ) : null}
                <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
            </div>
            {canEdit ? (
                <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => void run("link")} disabled={busy !== null}>
                        {busy === "link" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Check className="mr-1.5 h-4 w-4" />}
                        Link
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void run("reject")} disabled={busy !== null}>
                        {busy === "reject" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <X className="mr-1.5 h-4 w-4" />}
                        Not them
                    </Button>
                </div>
            ) : null}
        </li>
    );
}

export function FindCustomerLink({ reviewId, onLinked }: { reviewId: string; onLinked: () => void }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CustomerOverviewRow[] | null>(null);
    const [searching, setSearching] = useState(false);
    const [linking, setLinking] = useState<string | null>(null);
    const latestSearch = useRef(0);
    const q = query.trim();

    useEffect(() => {
        if (!open || q.length < 2) return;
        const timer = setTimeout(async () => {
            const search = ++latestSearch.current;
            setSearching(true);
            try {
                const params = new URLSearchParams({ search: q, limit: "5", page: "1" });
                const res = await fetch(`/api/shop/customers?${params.toString()}`);
                const json = await res.json().catch(() => null);
                if (search === latestSearch.current) setResults(res.ok ? ((json?.rows ?? []) as CustomerOverviewRow[]) : []);
            } finally {
                if (search === latestSearch.current) setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [open, q]);
    const shown = q.length < 2 ? null : results;

    if (!open) {
        return (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setOpen(true)}>
                <Search className="mr-1.5 h-4 w-4" />
                Find customer…
            </Button>
        );
    }

    const link = async (customerId: string) => {
        setLinking(customerId);
        try {
            if (await linkReview(reviewId, customerId, "manual")) onLinked();
        } finally {
            setLinking(null);
        }
    };

    return (
        <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2">
                <Input
                    autoFocus
                    aria-label="Find a customer by name or email"
                    placeholder="Name or email"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)} aria-label="Close">
                    <X className="h-4 w-4" />
                </Button>
            </div>
            {searching ? (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </p>
            ) : shown === null ? (
                <p className="text-xs text-muted-foreground">Type at least two letters.</p>
            ) : shown.length === 0 ? (
                <p className="text-xs text-muted-foreground">No customer matches.</p>
            ) : (
                <ul className="space-y-1.5">
                    {shown.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0">
                                <span className="font-medium">
                                    {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                                </span>
                                <span className="ml-1.5 break-all text-xs text-muted-foreground">{c.email}</span>
                            </span>
                            <Button size="sm" variant="outline" onClick={() => void link(c.id)} disabled={linking !== null}>
                                {linking === c.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                                Link
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
