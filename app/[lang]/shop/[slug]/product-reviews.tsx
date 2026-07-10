"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { ReviewStars } from "@/components/shop/review-stars";
import { getApiErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ProductReview } from "@/lib/types/ecommerce";

// ---------------------------------------------------------------------------
// Star display — see components/shop/review-stars.tsx
// ---------------------------------------------------------------------------

export { ReviewStars } from "@/components/shop/review-stars";

// ---------------------------------------------------------------------------
// Hook: fetch approved reviews for a product
// ---------------------------------------------------------------------------

interface ApprovedReviewsState {
  reviews: ProductReview[];
  count: number;
  average: number;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

export function useApprovedReviews(productId: string): ApprovedReviewsState {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    fetch(
      `/api/shop/reviews?product_id=${encodeURIComponent(
        productId
      )}&status=approved&limit=100`
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load reviews");
        return res.json();
      })
      .then((data: { rows?: ProductReview[] }) => {
        if (active) setReviews(data.rows ?? []);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [productId, nonce]);

  const average = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return sum / reviews.length;
  }, [reviews]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { reviews, count: reviews.length, average, loading, error, reload };
}

// ---------------------------------------------------------------------------
// Submission form
// ---------------------------------------------------------------------------

function ReviewForm({ productId }: { productId: string }) {
  const [authorName, setAuthorName] = useState("");
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

      if (!authorName.trim()) {
        setError("Please enter your name.");
        return;
      }
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
            author_name: authorName.trim(),
            rating,
            title: title.trim() || null,
            body: body.trim() || null,
          }),
        });
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
    [authorName, rating, title, body, productId]
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
      <h3 className="font-semibold text-base">Write a review</h3>

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
              className="p-0.5"
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
        <Label htmlFor="review-author">Your name</Label>
        <Input
          id="review-author"
          value={authorName}
          onChange={(e) => setAuthorName(e.target.value)}
          maxLength={200}
          placeholder="Jane D."
          required
        />
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

// ---------------------------------------------------------------------------
// Reviews tab: summary + list + form
// ---------------------------------------------------------------------------

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

export function ProductReviews({
  productId,
  reviews,
  average,
  count,
  loading,
}: {
  productId: string;
  reviews: ProductReview[];
  average: number;
  count: number;
  loading: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading reviews…
        </div>
      ) : count > 0 ? (
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

      <ReviewForm productId={productId} />
    </div>
  );
}
