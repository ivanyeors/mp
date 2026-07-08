"use client";

import * as React from "react";
import Image from "next/image";

import type { ImageMediaConfig } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type MeasurementGridSectionProps = {
  title: string;
  intro: string;
  steps: Array<{ title: string; description: string }>;
  stepImages: ImageMediaConfig[];
  borderTop?: boolean;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-foreground">{children}</div>;
}

export function MeasurementGridSection({
  title,
  intro,
  steps,
  stepImages,
  borderTop,
}: MeasurementGridSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <SectionTitle>{title}</SectionTitle>
      <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>

      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((step, index) => {
          const image = stepImages[index];
          return (
            <div key={step.title} className="space-y-2">
              <SectionSubtitle>{step.title}</SectionSubtitle>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              {image ? (
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    className="object-cover"
                    sizes={image.sizes ?? "(min-width: 768px) 50vw, 100vw"}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ProductSlideSection>
  );
}
