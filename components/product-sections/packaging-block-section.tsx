"use client";

import * as React from "react";
import Image from "next/image";

import type { ImageMediaConfig, PackagingBlockContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

type PackagingBlockSectionProps = {
  content: PackagingBlockContent;
  image?: ImageMediaConfig;
  borderTop?: boolean;
};

export function PackagingBlockSection({ content, image, borderTop }: PackagingBlockSectionProps) {
  return (
    <ProductSlideSection borderTop={borderTop} className="space-y-3">
      <SectionTitle>{content.title}</SectionTitle>

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

      <ul className="space-y-1.5 text-sm text-muted-foreground">
        {content.items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>

      {content.note ? (
        <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">{content.note}</div>
      ) : null}

      {content.callout ? (
        <div className="rounded-xl border bg-muted/20 p-4">
          <div className="text-sm font-semibold text-foreground">{content.callout.title}</div>
          <div className="mt-1 text-sm text-muted-foreground">{content.callout.description}</div>
          {content.callout.note ? (
            <div className="mt-2 text-xs text-muted-foreground">{content.callout.note}</div>
          ) : null}
        </div>
      ) : null}
    </ProductSlideSection>
  );
}
