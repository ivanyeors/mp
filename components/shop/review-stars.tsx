import { Star } from "lucide-react";
import type { ReviewAggregate } from "@/lib/seo/review-aggregate";

export function ReviewStars({
  rating,
  size = 16,
  className = "",
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`} aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(rating);
        return (
          <Star
            key={n}
            style={{ width: size, height: size }}
            className={
              filled ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"
            }
          />
        );
      })}
    </div>
  );
}

export function ProductRatingBadge({
  aggregate,
  size = 14,
}: {
  aggregate: ReviewAggregate;
  size?: number;
}) {
  if (aggregate.count < 1) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <ReviewStars rating={aggregate.average} size={size} />
      <span>
        {aggregate.average.toFixed(1)} ({aggregate.count})
      </span>
    </div>
  );
}
