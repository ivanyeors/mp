"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star, Loader2, CheckCircle2, LogIn, UserRound } from "lucide-react";
import { ReviewStars } from "@/components/shop/review-stars";
import { getApiErrorMessage } from "@/lib/utils";
import { getLocaleOrDefault, withLocale } from "@/lib/i18n/routing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { PublicProductReview } from "@/lib/types/ecommerce";
import type { ReviewAuthorState } from "@/lib/reviews/shop-review-byline";

export { ReviewStars } from "@/components/shop/review-stars";

function useReviewAuthor(): ReviewAuthorState | "error" | null {
  const [state, setState] = useState<ReviewAuthorState | "error" | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/shop/reviews/author", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to check sign-in");
        return res.json() as Promise<ReviewAuthorState>;
      })
      .then((data) => {
        if (active) setState(data);
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, []);

  return state;
}

function useSignInHref(): string {
  const pathname = usePathname() ?? "/";
  const locale = getLocaleOrDefault(pathname);
  return withLocale(`/account/login?next=${encodeURIComponent(`${pathname}#reviews`)}`, locale);
}

function ComposerCard({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-4 rounded-lg border p-6">{children}</div>;
}

function SignInPrompt({ note }: { note?: string }) {
  const signInHref = useSignInHref();
  return (
    <ComposerCard>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-base">Write a review</h3>
        <p className="text-sm text-muted-foreground">
          {note ?? "Reviews come from signed-in customers."} Sign in with Google or an email link,
          and you&apos;ll come straight back to this product.
        </p>
      </div>
      <Button asChild className="self-start">
        <Link href={signInHref}>
          <LogIn className="size-4" />
          Sign in to write a review
        </Link>
      </Button>
    </ComposerCard>
  );
}

function NoEmailNotice() {
  const signInHref = useSignInHref();
  return (
    <ComposerCard>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-base">Write a review</h3>
        <p className="text-sm text-muted-foreground">
          Reviews are linked to an email address, and the account you&apos;re signed in with
          doesn&apos;t have one. Sign in with Google or an email link instead to write a review.
        </p>
      </div>
      <form action={`/auth/signout?next=${encodeURIComponent(signInHref)}`} method="post">
        <Button type="submit" variant="outline">
          <LogIn className="size-4" />
          Sign in another way
        </Button>
      </form>
    </ComposerCard>
  );
}

function ReviewComposer({ productId }: { productId: string }) {
  const author = useReviewAuthor();
  const [sessionEnded, setSessionEnded] = useState(false);

  if (author === null) {
    return (
      <ComposerCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" />
          Checking your account…
        </div>
      </ComposerCard>
    );
  }
  if (author === "error") {
    return (
      <ComposerCard>
        <h3 className="font-semibold text-base">Write a review</h3>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t check whether you&apos;re signed in. Refresh the page to try again.
        </p>
      </ComposerCard>
    );
  }
  if (!author.signedIn || sessionEnded) {
    return <SignInPrompt note={sessionEnded ? "You've been signed out." : undefined} />;
  }
  if (!author.canReview) {
    if (author.reason === "no_email") return <NoEmailNotice />;
    return (
      <ComposerCard>
        <h3 className="font-semibold text-base">Write a review</h3>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load your account just now, so reviews are unavailable. Refresh the
          page to try again.
        </p>
      </ComposerCard>
    );
  }
  return (
    <ReviewForm
      productId={productId}
      byline={author.byline}
      named={author.named}
      onSessionEnded={() => setSessionEnded(true)}
    />
  );
}

function ReviewForm({
  productId,
  byline,
  named,
  onSessionEnded,
}: {
  productId: string;
  byline: string;
  named: boolean;
  onSessionEnded: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (rating < 1 || rating > 5) {
        setError("Please select a star rating.");
        return;
      }

      setSubmitting(true);
      try {
        const res = await fetch("/api/shop/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            product_id: productId,
            rating,
            title: title.trim() || null,
            body: body.trim() || null,
          }),
        });
        if (res.status === 401) {
          onSessionEnded();
          return;
        }
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            getApiErrorMessage(data?.error, "Failed to submit review")
          );
        }
        setSubmitted(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to submit review");
      } finally {
        setSubmitting(false);
      }
    },
    [rating, title, body, productId, onSessionEnded]
  );

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border bg-muted/30 p-6 text-center">
        <CheckCircle2 className="size-8 text-green-600 dark:text-green-400" />
        <p className="font-medium">Thanks for your review!</p>
        <p className="text-sm text-muted-foreground max-w-xs">
          It&apos;s been submitted and will appear here once it&apos;s approved by our team.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border p-6">
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-base">Write a review</h3>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <UserRound className="size-4 shrink-0" aria-hidden="true" />
          <span>
            Posting as <span className="font-medium text-foreground">{byline}</span>
          </span>
        </p>
        {!named && (
          <p className="text-xs text-muted-foreground">
            Your account has no name on it, so your review will show as &ldquo;{byline}&rdquo;.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Rating</Label>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHoverRating(n)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => setRating(n)}
              className="inline-flex items-center justify-center p-0.5 max-md:min-h-11 max-md:min-w-11"
            >
              <Star
                className={
                  n <= (hoverRating || rating)
                    ? "size-6 text-amber-400 fill-amber-400"
                    : "size-6 text-muted-foreground/40"
                }
              />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input
          id="review-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={300}
          placeholder="Sums up your experience"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-body">Review (optional)</Label>
        <Textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          placeholder="What did you like or dislike?"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button type="submit" disabled={submitting} className="self-start">
        {submitting && <Loader2 className="size-4 animate-spin" />}
        Submit review
      </Button>
    </form>
  );
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString("en-SG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function StoreReply({ reply, at }: { reply: string; at: string | null }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1 rounded-md border-l-2 border-foreground/20 bg-muted/40 px-3 py-2">
      <p className="text-xs font-medium text-foreground">
        Reply from the mpillow team
        {at ? <span className="font-normal text-muted-foreground"> · {formatDate(at)}</span> : null}
      </p>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">{reply}</p>
    </div>
  );
}

export function ProductReviews({
  productId,
  reviews,
  average,
  count,
}: {
  productId: string;
  reviews: PublicProductReview[];
  average: number;
  count: number;
}) {
  return (
    <div className="flex flex-col gap-8">
      {count > 0 ? (
        <>
          <div className="flex items-center gap-4">
            <div className="text-4xl font-bold">{average.toFixed(1)}</div>
            <div className="flex flex-col gap-1">
              <ReviewStars rating={average} size={18} />
              <p className="text-sm text-muted-foreground">
                Based on {count} review{count === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="flex flex-col divide-y">
            {reviews.map((review) => (
              <div key={review.id} className="flex flex-col gap-1.5 py-4">
                <div className="flex items-center gap-2">
                  <ReviewStars rating={review.rating} size={14} />
                  {review.title && (
                    <span className="font-medium text-sm">{review.title}</span>
                  )}
                </div>
                {review.body && (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {review.body}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {review.author_name} · {formatDate(review.created_at)}
                </p>
                {review.store_reply && (
                  <StoreReply reply={review.store_reply} at={review.store_reply_at} />
                )}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
          <ReviewStars rating={0} size={24} />
          <p className="text-lg font-medium">No reviews yet</p>
          <p className="text-sm text-center max-w-xs">
            Be the first to review this product.
          </p>
        </div>
      )}

      <ReviewComposer productId={productId} />
    </div>
  );
}
