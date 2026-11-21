"use client";

import { Carousel, MeasureTile } from "@/components/ui/apple-cards-carousel";
import SpotlightCard from "@/components/effects/SpotlightCard";
import type { MeasureCarouselContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type MeasureCarouselSectionProps = {
  content: MeasureCarouselContent;
  icons: string[];
  borderTop?: boolean;
};

export function MeasureCarouselSection({ content, icons, borderTop }: MeasureCarouselSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <h2 className="font-semibold leading-none">{content.title}</h2>
      {content.intro ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{content.intro}</p>
      ) : null}
      <Carousel
        itemsContainerClassName="w-full px-0 mx-0 max-w-none"
        items={content.cards.map((card, index) => (
          <SpotlightCard
            key={`${index}-${card.title}`}
            className="flex w-[min(100%,22rem)] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
            data-ui="size-matters-measurement-card"
          >
            <MeasureTile iconSrc={icons[index] ?? icons[0] ?? ""} title={card.title} description={card.description} />
          </SpotlightCard>
        ))}
      />
    </ProductSlideSection>
  );
}
