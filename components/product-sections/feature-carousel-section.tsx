"use client";

import * as React from "react";
import Image from "next/image";

import { Carousel } from "@/components/ui/apple-cards-carousel";

import { ProductSlideSection } from "./product-slide-section";

type FeatureCarouselCardProps = {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
};

export function FeatureCarouselCard({
  title,
  description,
  imageSrc,
  imageAlt,
}: FeatureCarouselCardProps) {
  return (
    <div className="flex w-72 flex-col overflow-hidden rounded-3xl bg-gray-100 dark:bg-neutral-900 md:w-96">
      <div className="relative aspect-[16/10]">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="object-cover"
          sizes="(min-width: 768px) 384px, 288px"
        />
      </div>
      <div className="space-y-1.5 p-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

type FeatureCarouselSectionProps = {
  items: FeatureCarouselCardProps[];
  title?: string;
  intro?: string;
  borderTop?: boolean;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

export function FeatureCarouselSection({ items, title, intro, borderTop }: FeatureCarouselSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      {title ? <SectionTitle>{title}</SectionTitle> : null}
      {intro ? <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p> : null}
      <Carousel
        itemsContainerClassName="w-full px-0 mx-0 max-w-none"
        items={items.map((item, index) => (
          <FeatureCarouselCard key={`${item.title}-${index}`} {...item} />
        ))}
      />
    </ProductSlideSection>
  );
}
