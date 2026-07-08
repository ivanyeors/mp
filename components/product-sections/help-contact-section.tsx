import type { HelpContactContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type HelpContactSectionProps = {
  content: HelpContactContent;
  borderTop?: boolean;
};

export function HelpContactSection({ content, borderTop }: HelpContactSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-2">
      <SectionTitle>{content.title}</SectionTitle>
      <p className="text-sm leading-relaxed text-muted-foreground">{content.description}</p>
    </ProductSlideSection>
  );
}
