"use client";

import DecryptedText from "@/components/effects/DecryptedText";
import type { PressQuoteContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type PressQuoteSectionProps = {
  content: PressQuoteContent;
  borderTop?: boolean;
};

/** A large centred quote that decrypts into view, then its source. */
export function PressQuoteSection({ content, borderTop }: PressQuoteSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop}>
      <figure className="mx-auto max-w-3xl space-y-3 py-6 text-center animate-in fade-in duration-700">
        <blockquote className="text-2xl font-semibold leading-relaxed tracking-tight md:text-4xl">
          <DecryptedText
            text={content.text}
            animateOn="view"
            sequential
            speed={20}
            loop
            loopDelay={5000}
          />
        </blockquote>
        {content.attribution ? (
          <figcaption className="text-sm text-muted-foreground">{content.attribution}</figcaption>
        ) : null}
      </figure>
    </ProductSlideSection>
  );
}
