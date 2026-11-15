"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Link2Off, Loader2, RefreshCw, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MAX_REPLY_CHARS, replyWarnings } from "@/lib/reviews/reply-rules";
import { REPLY_STYLE_NAMES, replyStyleFor } from "@/lib/reviews/reply-style";
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
import { CopyButton } from "./customer-shortcuts";

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
 * A Linked Google review can be answered from here
 * (PRD-customer-page-journey slice 03): a suggested reply to copy, a link that
 * opens the review on Google, and *Mark replied* once it is pasted there. The
 * platform posts nothing from this page.
 *
 * Its own fetch, like the cards beside it. The buttons render only for
 * `customers-edit`; the routes refuse without it.
 */
export function CustomerReviewsCard({
    customerId,
    canEdit,
    onCount,
}: {
    customerId: string;
    canEdit: boolean;
    /** Told how many reviews are on record (Google and shop), for the Reviews tab's badge. */
    onCount?: (count: number) => void;
}) {
    const [data, setData] = useState<CustomerReviewsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const started = useRef(false);
    const onCountRef = useRef(onCount);
    useEffect(() => {
        onCountRef.current = onCount;
    }, [onCount]);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/shop/customers/${customerId}/reviews`);
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Could not load reviews.");
            const next = json as CustomerReviewsData;
            setData(next);
            onCountRef.current?.(next.google.length + next.shop.length);
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
                        onAnswered={() => void load()}
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
    onAnswered = () => {},
}: {
    data: CustomerReviewsData;
    canEdit: boolean;
    busy?: string | null;
    onUnlink?: (review: LinkedGoogleReview) => void;
    onLink?: (reviewId: string) => void;
    onReject?: (reviewId: string) => void;
    /** A reply was marked as posted: the card reads again. */
    onAnswered?: () => void;
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
                            <ReviewAnswer review={r} canEdit={canEdit} onAnswered={onAnswered} />
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

async function postJson(url: string, body?: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !payload?.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "That did not work. Try again.");
    return payload;
}

/**
 * Answering one Linked Google review (PRD-customer-page-journey slice 03).
 *
 * A reply already on record is shown as it stands. Otherwise nothing is
 * suggested until a Staff member presses *Generate reply suggestion* (owner,
 * 2026-11-15): Claude is never called because the tab was opened. The first
 * press shows the draft the Telegram card already holds, when there is one,
 * so both places start from the same words and a draft a review manager wrote
 * there is not thrown away; with none, and on every *Generate again*, Claude
 * drafts one through the API.
 *
 * Then: the reply in a box Staff can edit, *Copy reply*, a link to the review
 * on Google, and, for a review Google cannot report a reply on, *Mark
 * replied*, which records the text in the box as what was posted. Nothing
 * here posts to Google.
 *
 * Without `customers-edit` only a reply on record shows.
 */
function ReviewAnswer({
    review,
    canEdit,
    onAnswered,
}: {
    review: LinkedGoogleReview;
    canEdit: boolean;
    onAnswered: () => void;
}) {
    const { answer } = review;
    const [text, setText] = useState("");
    // Where the words in the box came from; null until a suggestion was asked for.
    const [source, setSource] = useState<"telegram" | "claude" | null>(null);
    const [busy, setBusy] = useState<"draft" | "mark" | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (answer.posted) {
        return (
            <div className="space-y-1.5 rounded-md bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">Our reply</p>
                <p className="whitespace-pre-line break-words">{answer.posted}</p>
            </div>
        );
    }
    if (!canEdit) return null;

    const style = replyStyleFor(review.rating);
    const warnings = text.trim() ? replyWarnings(text, { style }) : [];

    const generate = async () => {
        setError(null);
        // The first press takes the draft that already exists; Claude is called only for a new one.
        if (source === null && answer.draft) {
            setText(answer.draft);
            setSource("telegram");
            return;
        }
        setBusy("draft");
        try {
            const payload = await postJson(`/api/settings/customers/google-reviews/${review.id}/draft`);
            setText(String(payload.reply ?? ""));
            setSource("claude");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Could not draft a reply");
        } finally {
            setBusy(null);
        }
    };

    const markReplied = async () => {
        if (!window.confirm("Mark this review as replied? Do this after the reply is posted on Google.")) return;
        setBusy("mark");
        try {
            await postJson(`/api/settings/customers/google-reviews/${review.id}/replied`, { reply: text });
            toast.success("Marked as replied");
            onAnswered();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not mark it replied");
        } finally {
            setBusy(null);
        }
    };

    const openOnGoogle = answer.url ? (
        <Button asChild size="sm" variant="outline">
            <a href={answer.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
                {answer.urlIsReview ? "Open this review on Google" : "Open our reviews on Google"}
            </a>
        </Button>
    ) : null;

    return (
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                {source === null
                    ? "Reply to this review"
                    : `Suggested reply · ${REPLY_STYLE_NAMES[style].toLowerCase()}${source === "telegram" ? " · the draft on the Telegram card" : " · drafted by Claude"}`}
            </p>
            {source !== null || busy === "draft" ? (
                <Textarea
                    aria-label="Reply to this review"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    maxLength={MAX_REPLY_CHARS}
                    rows={6}
                    disabled={busy === "draft"}
                    className="resize-y bg-background"
                />
            ) : (
                <p className="text-muted-foreground">
                    Claude can suggest a reply for you to edit. Nothing is drafted until you ask.
                </p>
            )}
            {error ? (
                <p role="alert" className="text-sm text-destructive">
                    {error}
                </p>
            ) : null}
            {warnings.length ? (
                <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                    {warnings.map((w) => (
                        <li key={w}>{w}</li>
                    ))}
                </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={source === null ? "default" : "ghost"} disabled={busy !== null} onClick={() => void generate()}>
                    {busy === "draft" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : source === null ? (
                        <Sparkles className="h-4 w-4" />
                    ) : (
                        <RefreshCw className="h-4 w-4" />
                    )}
                    {source === null ? "Generate reply suggestion" : "Generate again"}
                </Button>
                {text ? <CopyButton text={text} label="Copy reply" variant="outline" /> : null}
                {openOnGoogle}
                {answer.canMarkReplied && text.trim() ? (
                    <Button size="sm" disabled={busy !== null} onClick={() => void markReplied()}>
                        {busy === "mark" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Mark replied
                    </Button>
                ) : null}
            </div>
            {source !== null ? (
                <p className="text-xs text-muted-foreground">
                    {answer.url
                        ? answer.urlIsReview
                            ? "Copy the reply, open the review, and paste it there."
                            : "Copy the reply, open our reviews, find this one by its date, and paste it there."
                        : "Copy the reply and paste it under this review on Google."}
                    {answer.canMarkReplied ? " Google does not tell us when you have, so mark it replied afterwards." : " Google tells us once it is posted."}
                </p>
            ) : null}
        </div>
    );
}
