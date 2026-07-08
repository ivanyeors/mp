import * as React from "react";

import type { OutcomeGridContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type OutcomeGridSectionProps = {
  content: OutcomeGridContent;
  borderTop?: boolean;
};

export function OutcomeGridSection({ content, borderTop }: OutcomeGridSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop}>
      <div className="grid gap-3 sm:grid-cols-2">
        {content.outcomes.map((outcome) => (
          <div key={outcome.title} className="rounded-xl border bg-card/40 p-4">
            <div className="text-sm font-semibold text-foreground">{outcome.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{outcome.description}</p>
          </div>
        ))}
      </div>
    </ProductSlideSection>
  );
}
