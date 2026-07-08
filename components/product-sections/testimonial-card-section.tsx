"use client";

import * as React from "react";
import Image from "next/image";

import type { ImageMediaConfig } from "@/lib/product-slide-sections/types";
import type { TestimonialCardContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}

type TestimonialCardSectionProps = {
  headerTitle: string;
  headerIntro: string;
  reviewTitle: string;
  content: TestimonialCardContent;
  ratingLabel: string;
  ratingRows: Array<{ label: string; percent: string }>;
  image?: ImageMediaConfig;
  borderTop?: boolean;
};

export function TestimonialCardSection({
  headerTitle,
  headerIntro,
  reviewTitle,
  content,
  ratingLabel,
  ratingRows,
  image,
  borderTop,
}: TestimonialCardSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop}>
      <div className="space-y-6">
        <header className="space-y-2">
          <SectionTitle>{headerTitle}</SectionTitle>
          <p className="text-base leading-relaxed text-muted-foreground">{headerIntro}</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border bg-card/40 p-4">
            <div className="text-sm font-semibold text-foreground">{reviewTitle}</div>
            <div className="mt-2 text-sm text-muted-foreground">{content.quote}</div>
            <div className="mt-3 text-xs text-muted-foreground">{content.attribution}</div>
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="font-semibold text-foreground">{ratingLabel}</div>
            <div className="mt-2 space-y-1">
              {ratingRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span>{row.label}</span>
                  <span className="tabular-nums">{row.percent}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {image ? (
          <div className="relative aspect-[16/9] overflow-hidden rounded-xl border bg-card">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              className="object-cover"
              sizes={image.sizes ?? "(max-width: 768px) 100vw, 640px"}
            />
          </div>
        ) : null}
      </div>
    </ProductSlideSection>
  );
}
