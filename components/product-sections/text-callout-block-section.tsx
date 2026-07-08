import * as React from "react";

import type { TextCalloutBlockContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type TextCalloutBlockSectionProps = {
  content: TextCalloutBlockContent;
  borderTop?: boolean;
};

export function TextCalloutBlockSection({ content, borderTop }: TextCalloutBlockSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      {content.title ? <SectionTitle>{content.title}</SectionTitle> : null}
      <div className="space-y-2">
        {content.paragraphs.map((text) => (
          <p key={text} className="text-sm leading-relaxed text-muted-foreground">
            {text}
          </p>
        ))}
      </div>

      <div className="rounded-xl border bg-card/30 p-4">
        {content.calloutTitle ? (
          <div className="text-sm font-semibold text-foreground">{content.calloutTitle}</div>
        ) : null}
        <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
          {content.calloutItems.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </div>
    </ProductSlideSection>
  );
}
