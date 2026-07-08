"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { ImageMediaConfig, SectionCtaConfig, SplitHeroContent } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type SplitHeroSectionProps = {
  content: SplitHeroContent;
  image?: ImageMediaConfig;
  flip?: boolean;
  stacked?: boolean;
  stackedImages?: ImageMediaConfig[];
  cta?: SectionCtaConfig;
  buttonLabel?: string;
  onButtonClick?: () => void;
  resolveHref?: (href: string) => string;
  titleAs?: "h1" | "h2" | "h3";
  titleClassName?: string;
  imageWrapperClassName?: string;
  gridClassName?: string;
  borderTop?: boolean;
  sectionData?: Record<`data-${string}`, string>;
  headerData?: Record<`data-${string}`, string>;
};

function CtaButton({
  cta,
  resolveHref,
}: {
  cta: SectionCtaConfig;
  resolveHref?: (href: string) => string;
}) {
  const link = (
    <Button asChild className="h-auto py-3">
      <Link href={resolveHref ? resolveHref(cta.href) : cta.href}>{cta.label}</Link>
    </Button>
  );

  if (cta.closeSheet) {
    return (
      <div className="pt-1">
        <SheetClose asChild>{link}</SheetClose>
      </div>
    );
  }

  return <div className="pt-1">{link}</div>;
}

function StackedHeroBody({
  content,
  stackedImages,
}: {
  content: SplitHeroContent;
  stackedImages: ImageMediaConfig[];
}) {
  const paragraphs = content.stackedParagraphs ?? [];
  const [first, ...rest] = paragraphs;

  return (
    <div className="space-y-4">
      {content.eyebrow ? (
        <p className="text-sm font-medium text-muted-foreground">{content.eyebrow}</p>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{content.title}</h2>
      {first ? <p className="text-sm leading-relaxed text-muted-foreground">{first}</p> : null}
      {stackedImages[0] ? (
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl border bg-card">
          <Image
            src={stackedImages[0].src}
            alt={stackedImages[0].alt}
            fill
            className="object-cover"
            sizes={stackedImages[0].sizes ?? "(max-width: 768px) 100vw, 640px"}
          />
        </div>
      ) : null}
      {rest.map((text) => (
        <p key={text} className="text-sm leading-relaxed text-muted-foreground">
          {text}
        </p>
      ))}
      {stackedImages[1] ? (
        <div className="relative aspect-[16/9] overflow-hidden rounded-xl border bg-card">
          <Image
            src={stackedImages[1].src}
            alt={stackedImages[1].alt}
            fill
            className="object-cover"
            sizes={stackedImages[1].sizes ?? "(max-width: 768px) 100vw, 640px"}
          />
        </div>
      ) : null}
    </div>
  );
}

export function SplitHeroSection({
  content,
  image,
  flip,
  stacked,
  stackedImages,
  cta,
  buttonLabel,
  onButtonClick,
  resolveHref,
  titleAs = "h1",
  titleClassName,
  imageWrapperClassName,
  gridClassName,
  borderTop,
  sectionData,
  headerData,
}: SplitHeroSectionProps) {
  if (stacked) {
    return (
      <ProductSlideSection borderTop={borderTop} sectionData={sectionData}>
        <StackedHeroBody content={content} stackedImages={stackedImages ?? []} />
      </ProductSlideSection>
    );
  }

  if (!image) {
    const TitleTag = titleAs;
    return (
      <ProductSlideSection borderTop={borderTop} sectionData={sectionData}>
        <div className="space-y-2">
          {content.eyebrow ? (
            <p className="text-sm font-medium text-muted-foreground">{content.eyebrow}</p>
          ) : null}
          <TitleTag className={cn("text-xl font-semibold tracking-tight md:text-2xl", titleClassName)}>
            {content.title}
          </TitleTag>
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            {content.paragraphs?.map((text) => (
              <p key={text}>{text}</p>
            ))}
          </div>
        </div>
      </ProductSlideSection>
    );
  }

  const TitleTag = titleAs;

  return (
    <ProductSlideSection borderTop={borderTop} sectionData={sectionData}>
      <div className={cn("grid gap-4 md:grid-cols-2 md:items-center", gridClassName)}>
        <header {...headerData} className={cn("space-y-2", flip ? "md:order-2" : null)}>
          {content.eyebrow ? (
            <p className="text-sm font-medium text-muted-foreground">{content.eyebrow}</p>
          ) : null}

          <TitleTag
            className={cn("text-2xl font-semibold tracking-tight md:text-3xl", titleClassName)}
          >
            {content.title}
          </TitleTag>

          <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            {content.paragraphs?.map((text) => (
              <p key={text}>{text}</p>
            ))}

            {content.listTitle && content.listItems?.length ? (
              <div className="space-y-2 pt-2">
                <div className="text-sm font-semibold text-foreground">{content.listTitle}</div>
                <ul className="space-y-1.5">
                  {content.listItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {content.table ? (
              <div className="overflow-hidden rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="px-3 py-2.5 font-semibold">{content.table.sizeHeader}</th>
                      <th className="px-3 py-2.5 font-semibold">{content.table.shoulderHeader}</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr:not(:last-child)]:border-b">
                    {content.table.rows.map((row) => (
                      <tr key={row.size}>
                        <td className="px-3 py-2.5 font-medium">{row.size}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.shoulder}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          {cta?.label ? <CtaButton cta={cta} resolveHref={resolveHref} /> : null}

          {buttonLabel && onButtonClick ? (
            <div className="pt-1">
              <Button type="button" variant="outline" className="h-auto py-3" onClick={onButtonClick}>
                {buttonLabel}
              </Button>
            </div>
          ) : null}
        </header>

        <div className={cn(flip ? "md:order-1" : null)}>
          <div
            className={cn(
              "relative aspect-[4/3] overflow-hidden rounded-xl border bg-card",
              imageWrapperClassName,
            )}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              className={cn("object-cover", image.className)}
              sizes={image.sizes ?? "(min-width: 768px) 50vw, 100vw"}
              priority={image.priority}
            />
          </div>
        </div>
      </div>
    </ProductSlideSection>
  );
}
