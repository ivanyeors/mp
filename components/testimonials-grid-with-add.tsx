"use client";

import { Plus, Star } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Testimonial } from "@/lib/google/fallback-testimonials";

function Stars({ rating = 5 }: { rating?: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="mb-4 flex items-center gap-1" aria-label={`${filled} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, idx) => (
        <Star
          key={idx}
          className={[
            "h-4 w-4",
            idx < filled ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40",
          ].join(" ")}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function initialsFromName(name: string): string {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return initials || "G";
}

export function TestimonialsGridWithAdd({
  testimonials,
  writeReviewUrl = "https://share.google/92zAQnQWGM1SBCFh9",
}: {
  testimonials: Testimonial[];
  writeReviewUrl?: string;
}) {
  return (
    <div className="columns-1 md:columns-2 lg:columns-3 [column-gap:1.5rem]">
      {testimonials.map((t) => (
        <div key={t.name} className="mb-6 break-inside-avoid">
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <Stars rating={t.rating ?? 5} />
              <blockquote className="text-foreground mb-6 text-sm leading-relaxed">
                &quot;{t.quote}&quot;
              </blockquote>
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  <AvatarImage
                    src={t.avatarSrc}
                    alt={t.avatarAlt ?? t.name}
                    referrerPolicy="no-referrer"
                  />
                  <AvatarFallback className="text-sm font-semibold text-muted-foreground">
                    {initialsFromName(t.name)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-muted-foreground text-sm">{t.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}

      <a
        href={writeReviewUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Write a review on Google (opens in a new tab)"
        className="mb-6 block break-inside-avoid"
      >
        <Card className="border-dashed hover:border-primary hover:bg-accent/50 cursor-pointer transition-all">
          <CardContent className="flex h-full min-h-[280px] flex-col items-center justify-center p-6 text-center">
            <div className="bg-primary/10 mb-4 rounded-full p-4">
              <Plus className="text-primary h-8 w-8" aria-hidden="true" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">Add Your Review</h3>
            <p className="text-muted-foreground text-sm">Share your experience with our product</p>
          </CardContent>
        </Card>
      </a>
    </div>
  );
}

