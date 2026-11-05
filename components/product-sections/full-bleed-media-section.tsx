"use client";

import * as React from "react";
import Image from "next/image";

import type { FullBleedMediaContent, ImageMediaConfig } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type FullBleedMediaSectionProps = {
  image: ImageMediaConfig;
  /** Optional heading over the image; absent when the config names no copy. */
  content?: FullBleedMediaContent;
  borderTop?: boolean;
};

export function FullBleedMediaSection({ image, content, borderTop }: FullBleedMediaSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      {content?.title ? <h3 className="text-lg font-semibold tracking-tight">{content.title}</h3> : null}
      {content?.description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
      ) : null}
      <div className="relative overflow-hidden rounded-xl border bg-card/30">
        <div className={`relative ${image.className?.includes("object-contain") ? "aspect-[3/1]" : "aspect-[16/9]"} bg-muted/20`}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className={image.className ?? "object-cover"}
            sizes={image.sizes ?? "100vw"}
          />
        </div>
      </div>
    </ProductSlideSection>
  );
}
