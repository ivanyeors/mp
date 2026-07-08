"use client";

import * as React from "react";
import Image from "next/image";

import { FirmnessScale } from "@/components/firmness-scale";
import type { FirmnessScaleConfig } from "@/lib/product-slide-sections/section-config";
import type { ImageMediaConfig, SplitHeroDualMediaContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type SplitHeroDualMediaSectionProps = {
  content: SplitHeroDualMediaContent;
  heroImage: ImageMediaConfig;
  secondaryImage: ImageMediaConfig;
  scales: Array<FirmnessScaleConfig & { title: string }>;
  borderTop?: boolean;
};

export function SplitHeroDualMediaSection({
  content,
  heroImage,
  secondaryImage,
  scales,
  borderTop,
}: SplitHeroDualMediaSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="pt-5">
      <div className="space-y-4">
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
          <Image
            src={heroImage.src}
            alt={heroImage.alt}
            fill
            className="object-cover"
            sizes={heroImage.sizes ?? "100vw"}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-foreground">{content.subtitle}</div>
            {content.paragraphs.map((text) => (
              <p key={text} className="text-sm leading-relaxed text-muted-foreground">
                {text}
              </p>
            ))}

            <div className="w-full space-y-3">
              {scales.map((scale) =>
                scale.mode === "range" ? (
                  <FirmnessScale
                    key={scale.title}
                    mode="range"
                    value={scale.value as [number, number]}
                    title={scale.title}
                    label={scale.label}
                    className="w-full"
                  />
                ) : (
                  <FirmnessScale
                    key={scale.title}
                    mode="point"
                    value={scale.value as number}
                    title={scale.title}
                    label={scale.label}
                    className="w-full"
                  />
                ),
              )}
            </div>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
            <Image
              src={secondaryImage.src}
              alt={secondaryImage.alt}
              fill
              className="object-cover"
              sizes={secondaryImage.sizes ?? "(min-width: 768px) 50vw, 100vw"}
            />
          </div>
        </div>
      </div>
    </ProductSlideSection>
  );
}
