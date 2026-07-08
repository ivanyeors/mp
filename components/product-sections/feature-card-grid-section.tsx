"use client";

import * as React from "react";
import Image from "next/image";

import type { FeatureCardGridContent, ImageMediaConfig } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

function BenefitCard({
  image,
  title,
  description,
}: {
  image?: ImageMediaConfig;
  title: string;
  description: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card/40 shadow-sm">
      {image ? (
        <div className="relative aspect-[4/3] bg-muted/20">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            className="object-cover"
            sizes={image.sizes ?? "(min-width: 768px) 33vw, 100vw"}
          />
        </div>
      ) : null}
      <div className="p-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

type FeatureCardGridSectionProps = {
  content: FeatureCardGridContent;
  cardImages?: Array<ImageMediaConfig | undefined>;
  borderTop?: boolean;
};

export function FeatureCardGridSection({ content, cardImages, borderTop }: FeatureCardGridSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <SectionTitle>{content.title}</SectionTitle>
      <div className="grid gap-3 md:grid-cols-3">
        {content.cards.map((card, index) => (
          <BenefitCard
            key={card.title}
            title={card.title}
            description={card.description}
            image={cardImages?.[index]}
          />
        ))}
      </div>
    </ProductSlideSection>
  );
}
