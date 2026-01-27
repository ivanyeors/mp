"use client";

import { useMemo, useState } from "react";

import type { Testimonial } from "@/lib/google/fallback-testimonials";
import { Button } from "@/components/ui/button";
import { TestimonialsGridWithAdd } from "@/components/testimonials-grid-with-add";

function sortOldestToNewest(items: Testimonial[]): Testimonial[] {
  const withDates = items.filter((i) => typeof i.publishedAt === "string" && i.publishedAt.length > 0);
  if (withDates.length === 0) return items;

  return [...items].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : Number.NaN;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : Number.NaN;
    const aOk = Number.isFinite(ta);
    const bOk = Number.isFinite(tb);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return ta - tb;
  });
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
  const ordered = useMemo(() => sortOldestToNewest(testimonials), [testimonials]);
  const initialVisibleCount = useMemo(() => {
    // Google Places often returns a small subset of reviews (commonly 5).
    // If total reviews <= batchSize, start by showing a smaller slice so "View more" actually does something.
    if (ordered.length <= batchSize) return Math.min(ordered.length, Math.max(1, Math.min(3, ordered.length)));
    return Math.min(batchSize, ordered.length);
  }, [batchSize, ordered.length]);

  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  const startIdx = Math.max(0, ordered.length - visibleCount);
  const visible = ordered.slice(startIdx);

  const canViewMore = startIdx > 0;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h2>
          {subtitle ? <p className="text-muted-foreground">{subtitle}</p> : null}
        </div>

        <Button
          variant="outline"
          className="shrink-0"
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

