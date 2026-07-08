"use client";

import * as React from "react";
import Image from "next/image";

import type { CommitmentCardsContent, ImageMediaConfig } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type CommitmentCardsSectionProps = {
  content: CommitmentCardsContent;
  image?: ImageMediaConfig;
  borderTop?: boolean;
};

export function CommitmentCardsSection({ content, image, borderTop }: CommitmentCardsSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <SectionTitle>{content.title}</SectionTitle>

      <div className="space-y-3 text-sm text-muted-foreground">
        {content.cards.map((card) => (
          <div key={card.title} className="space-y-1">
            <div className="font-semibold text-foreground">{card.title}</div>
            <p className="leading-relaxed">{card.description}</p>
          </div>
        ))}
      </div>

      {image ? (
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-cover"
            sizes={image.sizes ?? "(min-width: 768px) 70vw, 100vw"}
          />
        </div>
      ) : null}
    </ProductSlideSection>
  );
}
