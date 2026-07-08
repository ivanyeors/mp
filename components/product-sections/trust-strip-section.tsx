import type { TrustStripContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type TrustStripSectionProps = {
  content: TrustStripContent;
  borderTop?: boolean;
};

export function TrustStripSection({ content, borderTop }: TrustStripSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {content.items.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border bg-card/40 px-3 py-3 text-center text-xs font-medium leading-snug md:text-sm"
          >
            {item.label}
          </div>
        ))}
      </div>
    </ProductSlideSection>
  );
}
