"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { openBookAppointmentSheet } from "@/components/slide-in-pages/book-appointment-sheet";
import { cn } from "@/lib/utils";
import type { ImageMediaConfig } from "@/lib/product-slide-sections/types";

import { ProductSlideSection } from "./product-slide-section";

type PurchasePanelMessages = {
  heroLabel: string;
  heroTitle: string;
  heroDescription: string;
  zoomLabel: string;
  salePriceLabel: string;
  reviewCountLabel: string;
  sizeLabel: string;
  sizePlaceholder: string;
  sizes: string[];
  caseTypeLabel: string;
  caseTypePlaceholder: string;
  caseTypes: string[];
  purchaseNote: string;
  purchaseLinkLabel: string;
};

type PurchasePanelSectionProps = {
  messages: PurchasePanelMessages;
  commonMessages: { addToCart: string; customise: string; bookAppointment: string };
  heroImage: ImageMediaConfig;
  gallery: ImageMediaConfig[];
  price: string;
  resolveHref: (href: string) => string;
  borderTop?: boolean;
};

type Option = { value: string; label: string };

export function PurchasePanelSection({
  messages: m,
  commonMessages,
  heroImage,
  gallery,
  price,
  resolveHref,
  borderTop,
}: PurchasePanelSectionProps) {
  const sizeOptions = React.useMemo<Option[]>(
    () => [
      { value: "size-s", label: m.sizes[0] ?? "Size S" },
      { value: "size-m", label: m.sizes[1] ?? "Size M" },
      { value: "size-l", label: m.sizes[2] ?? "Size L" },
    ],
    [m.sizes],
  );

  const caseTypeOptions = React.useMemo<Option[]>(
    () => [
      { value: "camel", label: m.caseTypes[0] ?? "Camel Case" },
      { value: "light-green", label: m.caseTypes[1] ?? "Light Green Case" },
      { value: "light-blue", label: m.caseTypes[2] ?? "Light Blue Case" },
    ],
    [m.caseTypes],
  );

  const [size, setSize] = React.useState("size-s");
  const [caseType, setCaseType] = React.useState("camel");
  const [galleryIdx, setGalleryIdx] = React.useState(0);

  return (
    <ProductSlideSection borderTop={borderTop} className="py-10 md:py-16">
      <div className="space-y-6">
        <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
          <Image
            src={heroImage.src}
            alt={heroImage.alt}
            fill
            className="object-cover"
            sizes={heroImage.sizes ?? "(max-width: 768px) 100vw, 640px"}
          />
        </AspectRatio>

        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{m.heroLabel}</p>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{m.heroTitle}</h2>
          <p className="text-base leading-relaxed text-muted-foreground">{m.heroDescription}</p>
        </header>

        <div className="space-y-3">
          <div className="text-sm font-medium text-muted-foreground">{m.zoomLabel}</div>

          <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-xl border bg-card">
            <Image
              src={gallery[galleryIdx]?.src ?? gallery[0]?.src ?? ""}
              alt={gallery[galleryIdx]?.alt ?? "Mbolster gallery"}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 640px"
            />
          </AspectRatio>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {gallery.map((item, idx) => (
              <button
                key={item.src}
                type="button"
                onClick={() => setGalleryIdx(idx)}
                className={cn(
                  "focus-visible:ring-ring focus-visible:ring-offset-background relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/20 ring-offset-2 focus-visible:ring-2 focus-visible:outline-hidden",
                  idx === galleryIdx ? "border-foreground/40" : "border-border",
                )}
                aria-label={`View image ${idx + 1}`}
              >
                <Image src={item.src} alt={item.alt} fill className="object-cover" sizes="64px" />
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">{m.salePriceLabel}</div>
              <div className="text-3xl font-bold tabular-nums">{price}</div>
              <div className="mt-1 text-sm text-muted-foreground">{m.reviewCountLabel}</div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href={resolveHref("/mbolster-config")}>{commonMessages.addToCart}</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={resolveHref("/mbolster-config")}>{commonMessages.customise}</Link>
              </Button>
              <Button type="button" variant="outline" onClick={openBookAppointmentSheet}>
                {commonMessages.bookAppointment}
              </Button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">{m.sizeLabel}</div>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.sizePlaceholder} />
                </SelectTrigger>
                <SelectContent align="start">
                  {sizeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">{m.caseTypeLabel}</div>
              <Select value={caseType} onValueChange={setCaseType}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={m.caseTypePlaceholder} />
                </SelectTrigger>
                <SelectContent align="start">
                  {caseTypeOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {m.purchaseNote}{" "}
            <Link className="underline underline-offset-4" href={resolveHref("/mbolster-config")}>
              {m.purchaseLinkLabel}
            </Link>
            .
          </div>
        </div>
      </div>
    </ProductSlideSection>
  );
}
