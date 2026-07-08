import * as React from "react";

import type { IconListContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type IconListSectionProps = {
  content: IconListContent;
  borderTop?: boolean;
};

export function IconListSection({ content, borderTop }: IconListSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <SectionTitle>{content.title}</SectionTitle>
      {content.intro ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{content.intro}</p>
      ) : null}
      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {content.items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
      {content.conclusion ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{content.conclusion}</p>
      ) : null}
    </ProductSlideSection>
  );
}
