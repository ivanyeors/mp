import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

type DataAttributes = {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

type ImageConfig = {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
};

export type LeftContentRightImgSectionProps = {
  className?: string;
  /**
   * Optional extra props for the outer <section> (e.g. id, data-*, aria-*).
   * `className` here will be merged with `className`.
   */
  sectionProps?: Omit<React.ComponentPropsWithoutRef<"section">, "children"> & DataAttributes;
  gridClassName?: string;
  headerClassName?: string;
  /**
   * Swap the two columns (text ↔ right/image) on `md` and up.
   */
  flip?: boolean;
  /**
   * Optional extra props for the internal <header> (e.g. id, data-*, aria-*).
   * `className` here will be merged with `headerClassName`.
   */
  headerProps?: Omit<React.ComponentPropsWithoutRef<"header">, "children"> & DataAttributes;
  titleClassName?: string;
  /**
   * Optional extra props for the title element (e.g. id, aria-*).
   * `className` here will be merged with `titleClassName`.
   */
  titleProps?: Omit<React.HTMLAttributes<HTMLElement>, "children">;
  descriptionClassName?: string;
  ctaWrapperClassName?: string;
  imageWrapperClassName?: string;

  /**
   * Heading element used for the title. Defaults to `h1`.
   */
  titleAs?: React.ElementType;

  title: React.ReactNode;
  description?: React.ReactNode;
  cta?: React.ReactNode;

  /**
   * Provide either `right` (fully custom node) OR `image` (standard next/image render).
   */
  right?: React.ReactNode;
  image?: ImageConfig;
};

export function LeftContentRightImgSection({
  className,
  sectionProps,
  gridClassName,
  headerClassName,
  flip,
  headerProps,
  titleClassName,
  titleProps,
  descriptionClassName,
  ctaWrapperClassName,
  imageWrapperClassName,
  titleAs,
  title,
  description,
  cta,
  right,
  image,
}: LeftContentRightImgSectionProps) {
  const { className: sectionClassName, ...restSectionProps } = sectionProps ?? {};
  const { className: headerElementClassName, ...restHeaderProps } = headerProps ?? {};
  const { className: titleElementClassName, ...restTitleProps } = titleProps ?? {};
  const TitleTag = (titleAs ?? "h1") as React.ElementType;

  return (
    <section {...restSectionProps} className={cn("px-4 md:px-6 space-y-4", sectionClassName, className)}>
      <div className={cn("grid gap-4 md:grid-cols-2 md:items-center", gridClassName)}>
        <header
          {...restHeaderProps}
          className={cn("space-y-2", flip ? "md:order-2" : null, headerElementClassName, headerClassName)}
        >
          <TitleTag
            {...restTitleProps}
            className={cn("text-2xl font-semibold tracking-tight md:text-3xl", titleClassName, titleElementClassName)}
          >
            {title}
          </TitleTag>

          {description ? (
            <div className={cn("space-y-2 text-sm leading-relaxed text-muted-foreground", descriptionClassName)}>
              {description}
            </div>
          ) : null}

          {cta ? <div className={cn("pt-1", ctaWrapperClassName)}>{cta}</div> : null}
        </header>

        <div className={cn(flip ? "md:order-1" : null)}>
          {right ? (
            right
          ) : image ? (
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
          ) : null}
        </div>
      </div>
    </section>
  );
}

