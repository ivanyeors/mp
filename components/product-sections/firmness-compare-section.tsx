import * as React from "react";

import { FirmnessScale } from "@/components/firmness-scale";
import type { FirmnessCompareContent } from "@/lib/product-slide-sections/types";
import type { FirmnessScaleConfig } from "@/lib/product-slide-sections/section-config";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type FirmnessCompareSectionProps = {
  content: FirmnessCompareContent;
  scales: Array<FirmnessScaleConfig & { title: string }>;
  borderTop?: boolean;
};

export function FirmnessCompareSection({ content, scales, borderTop }: FirmnessCompareSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop}>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-2">
          <SectionTitle>{content.title}</SectionTitle>
          {content.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
          ) : null}
        </div>

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
    </ProductSlideSection>
  );
}
