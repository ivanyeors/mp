"use client";

import * as React from "react";
import Image from "next/image";

import type { ImageMediaConfig, MediaIntroContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type MediaIntroSectionProps = {
  content: MediaIntroContent;
  image: ImageMediaConfig;
  borderTop?: boolean;
};

export function MediaIntroSection({ content, image, borderTop }: MediaIntroSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="pt-5">
      <div className="space-y-4">
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-cover"
            sizes={image.sizes ?? "100vw"}
          />
        </div>

        <div className="space-y-2">
          {content.eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{content.eyebrow}</p>
          ) : null}
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{content.title}</h2>
          {content.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
          ) : null}
        </div>
      </div>
    </ProductSlideSection>
  );
}
