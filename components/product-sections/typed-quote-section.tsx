"use client";

import dynamic from "next/dynamic";

import type { TypedQuoteContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

const TextType = dynamic(() => import("@/components/effects/TextType"), { ssr: false });

type TypedQuoteSectionProps = {
  content: TypedQuoteContent;
  borderTop?: boolean;
};

/** A testimonial typed out once it scrolls into view, then who said it. */
export function TypedQuoteSection({ content, borderTop }: TypedQuoteSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{content.title}</h2>
      <figure className="space-y-2 pt-3">
        {/* The typed text is animated; screen readers get the whole quote at once. */}
        <blockquote className="sr-only">{content.quote}</blockquote>
        <div aria-hidden="true">
          <TextType
            as="p"
            className="text-sm font-normal leading-relaxed text-foreground"
            text={content.quote}
            typingSpeed={22}
            pauseDuration={1500}
            deletingSpeed={18}
            loop={false}
            showCursor
            cursorCharacter="_"
            cursorBlinkDuration={0.5}
            startOnVisible
          />
        </div>
        {content.attribution ? (
          <figcaption className="text-xs font-extralight text-muted-foreground">{content.attribution}</figcaption>
        ) : null}
      </figure>
    </ProductSlideSection>
  );
}
