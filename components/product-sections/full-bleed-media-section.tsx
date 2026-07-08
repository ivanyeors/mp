"use client";

import * as React from "react";
import Image from "next/image";

import type { ImageMediaConfig } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type FullBleedMediaSectionProps = {
  image: ImageMediaConfig;
  borderTop?: boolean;
};

export function FullBleedMediaSection({ image, borderTop }: FullBleedMediaSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
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
