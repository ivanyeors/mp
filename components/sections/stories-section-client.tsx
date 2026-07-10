"use client";

import { useMemo, useState } from "react";

import type { Testimonial } from "@/lib/google/fallback-testimonials";
import { Button } from "@/components/ui/button";
import { TestimonialsGridWithAdd } from "@/components/ui/testimonials-grid-with-add";

function sortByRatingThenRelevance(items: Testimonial[]): Testimonial[] {
  return items
    .map((item, relevanceRank) => ({ item, relevanceRank }))
    .sort((a, b) => {
      const ratingDiff = (b.item.rating ?? 0) - (a.item.rating ?? 0);
      if (ratingDiff !== 0) return ratingDiff;
      return a.relevanceRank - b.relevanceRank;
    })
    .map(({ item }) => item);
}

export function StoriesSectionClient({
  title,
  subtitle,
  testimonials,
  writeReviewUrl,
  batchSize = 6,
}: {
  title: string;
  subtitle?: string;
  testimonials: Testimonial[];
  writeReviewUrl: string;
  batchSize?: number;
}) {
  const ordered = useMemo(() => sortByRatingThenRelevance(testimonials), [testimonials]);
  const initialVisibleCount = useMemo(() => {
    // Prefer showing as many as we have (up to batchSize) so the section doesn't look sparse.
    // The Places API typically returns a small subset anyway (commonly ~5).
    return Math.min(batchSize, ordered.length);
  }, [batchSize, ordered.length]);

  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  const visible = ordered.slice(0, visibleCount);
  const canViewMore = visibleCount < ordered.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">{title}</h2>
          {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
        </div>

        <Button
          variant="outline"
          className="w-full shrink-0 sm:w-auto"
          disabled={!canViewMore}
          onClick={() => setVisibleCount((c) => Math.min(ordered.length, c + batchSize))}
        >
          View more
        </Button>
      </div>

      <TestimonialsGridWithAdd testimonials={visible} writeReviewUrl={writeReviewUrl} />
    </div>
  );
}
