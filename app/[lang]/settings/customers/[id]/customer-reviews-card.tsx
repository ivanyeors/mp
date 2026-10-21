"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2Off, Loader2, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    GOOGLE_REPLY_LABELS,
    reviewDate,
    reviewShortDate,
    reviewerLabel,
    stars,
    type CustomerReviewsData,
    type LinkedGoogleReview,
} from "@/lib/crm/reviews";
import { linkReview, rejectMatch, unlinkReview } from "../review-match-parts";

const SHOP_STATUS: Record<CustomerReviewsData["shop"][number]["status"], string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
};

const CHANNEL_LABEL = { email: "email", whatsapp: "WhatsApp" } as const;

/**
 * Reviews on the Customer detail (CRM slice 12): did they review us, where and
 * how many stars, and did we ask them.
 *
 *  - **Their Google review**, once a Staff member has linked it: stars, the
 *    whole review, its date, whether we replied, and who linked it and when.
 *    *Unlink* also stops it being suggested again.
 *  - **Shop reviews**: rating, product, moderation status and date.
 *  - **The Review request**: asked on, and whether the link was clicked (a
 *    hint: mail scanners open links).
 *  - **Possible Google reviews** awaiting a decision: *Link?* *Not them?*
 *
 * Its own fetch, like the cards beside it. The buttons render only for
 * `customers-edit`; the routes refuse without it.
 */
export function CustomerReviewsCard({ customerId, canEdit }: { customerId: string; canEdit: boolean }) {
    const [data, setData] = useState<CustomerReviewsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const started = useRef(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/reviews`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not load reviews.");
            setData(json as CustomerReviewsData);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load reviews.");
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void load();
    }, [load]);

    const act = async (key: string, fn: () => Promise<boolean>) => {
        setBusy(key);
        try {
            if (await fn()) await load();
        } finally {
            setBusy(null);
        }
    };

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Reviews
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
                {loading && !data ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading reviews…
                    </div>
                ) : error && !data ? (
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <span>{error}</span>
                        <Button size="sm" variant="ghost" onClick={() => void load()}>
                            Try again
                        </Button>
                    </div>
                ) : data ? (
                    <CustomerReviewsBody
                        data={data}
                        canEdit={canEdit}
                        busy={busy}
                        onUnlink={(r) => void act(`unlink:${r.id}`, () => unlinkReview(r.id, customerId))}
                        onLink={(id) => void act(`link:${id}`, () => linkReview(id, customerId, "suggestion"))}
                        onReject={(id) => void act(`reject:${id}`, () => rejectMatch(id, customerId))}
                    />
                ) : null}
            </CardContent>
        </Card>
    );
}

/** The card's content, pure of fetching, so it renders on the server in tests. */
export function CustomerReviewsBody({
    data,
    canEdit,
    busy = null,
    onUnlink = () => {},
    onLink = () => {},
    onReject = () => {},
}: {
    data: CustomerReviewsData;
    canEdit: boolean;
    busy?: string | null;
    onUnlink?: (review: LinkedGoogleReview) => void;
    onLink?: (reviewId: string) => void;
    onReject?: (reviewId: string) => void;
}) {
    const { google, shop, request, possible } = data;
    return (
        <>
            <section className="space-y-2" aria-label="Google review">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Google</p>
                {google.length === 0 ? (
                    <p className="text-muted-foreground">No Google review linked.</p>
                ) : (
                    google.map((r) => (
                        <div key={r.id} className="space-y-1.5 rounded-lg border p-3">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold">{stars(r.rating)}</span>
                                <span suppressHydrationWarning>{reviewDate(r.reviewedAt)}</span>
                                <Badge variant="outline" className="text-xs font-normal">
                                    {GOOGLE_REPLY_LABELS[r.reply]}
                                </Badge>
                            </div>
                            <p className="whitespace-pre-line break-words">
                                {r.comment ? <>&ldquo;{r.comment}&rdquo;</> : "(Rating only, no written review)"}
                            </p>
                            <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                                As {reviewerLabel(r)} on Google. Linked {r.how === "manual" ? "by hand " : ""}
                                by {r.linkedBy ?? "Staff"} on {reviewDate(r.linkedAt)}.
                            </p>
                            {canEdit ? (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2"
                                    disabled={busy !== null}
                                    onClick={() => onUnlink(r)}
                                >
                                    {busy === `unlink:${r.id}` ? (
                                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Link2Off className="mr-1.5 h-4 w-4" />
                                    )}
                                    Unlink (not them)
                                </Button>
                            ) : null}
                        </div>
                    ))
                )}
                {possible.map(({ review, reason }) => (
                    <div key={review.id} className="space-y-1.5 rounded-lg border border-dashed p-3">
                        <p suppressHydrationWarning>
                            Possible Google review: <span className="font-semibold">{stars(review.rating)}</span> by
                            &ldquo;{reviewerLabel(review)}&rdquo; on {reviewShortDate(review.reviewedAt)}
                            {review.excerpt ? <>: &ldquo;{review.excerpt}&rdquo;</> : null}
                        </p>
                        <p className="text-xs text-muted-foreground">{reason}</p>
                        {canEdit ? (
                            <div className="flex gap-2">
                                <Button size="sm" disabled={busy !== null} onClick={() => onLink(review.id)}>
                                    {busy === `link:${review.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                                    Link?
                                </Button>
                                <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => onReject(review.id)}>
                                    {busy === `reject:${review.id}` ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                                    Not them?
                                </Button>
                            </div>
                        ) : null}
                    </div>
                ))}
            </section>

            <section className="space-y-2" aria-label="Shop reviews">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shop</p>
                {shop.length === 0 ? (
                    <p className="text-muted-foreground">No shop reviews.</p>
                ) : (
                    <ul className="space-y-1.5">
                        {shop.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-semibold">{stars(r.rating)}</span>
                                <span className="min-w-0 break-words">{r.product ?? "A product"}</span>
                                <Badge variant="outline" className="text-xs font-normal">
                                    {SHOP_STATUS[r.status]}
                                </Badge>
                                <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                                    {reviewDate(r.createdAt)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="space-y-1" aria-label="Review request">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Review request</p>
                {!request ? (
                    <p className="text-muted-foreground">Not asked.</p>
                ) : !request.askedAt ? (
                    <p className="text-muted-foreground">Asked, not delivered yet: a failed email is retried.</p>
                ) : (
                    <p suppressHydrationWarning>
                        Sent {reviewDate(request.askedAt)} by {request.channels.map((c) => CHANNEL_LABEL[c]).join(" and ")}
                        {" · "}
                        {request.clickedAt
                            ? `link clicked ${reviewDate(request.clickedAt)}${request.clickCount > 1 ? ` (${request.clickCount} times)` : ""}`
                            : "not clicked"}
                    </p>
                )}
            </section>
        </>
    );
}
