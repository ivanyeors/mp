"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";

type Props = {
  className?: string;
  triggerLabel?: string;
};

type ControlledSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Option = { value: string; label: string };
type Media = { src: string; alt: string };

// Images mapped from mpillow.com `/products/bolsters`, using local assets from `/public`.
// Source: `https://www.mpillow.com/products/bolsters`
const MBOLSTER_GALLERY: Media[] = [
  { src: "/MpillowIGPostMay2025.zip-2.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/MpillowIGPostMay2025.zip-5.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/Mpillow_IG_Post_May_2025.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/IMG_5097.jpg", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/IMG_5110.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}

export function MbolsterLearnMoreSlideIn({ className, triggerLabel }: Props) {
  const { m, locale } = useI18n();
  const to = React.useCallback((href: string) => withLocale(href, locale), [locale]);
  const label = triggerLabel ?? m.slides.mbolster.trigger;

  const sizeOptions = React.useMemo<Option[]>(
    () => [
      { value: "size-s", label: m.slides.mbolster.sizes[0] ?? "Size S (D15 × 0.8m)" },
      { value: "size-m", label: m.slides.mbolster.sizes[1] ?? "Size M (D20 × 1.0m)" },
      { value: "size-l", label: m.slides.mbolster.sizes[2] ?? "Size L (D20 × 1.2m)" },
    ],
    [m],
  );

  const caseTypeOptions = React.useMemo<Option[]>(
    () => [
      { value: "camel", label: m.slides.mbolster.caseTypes[0] ?? "Bolster + Inner Protector + Camel Case" },
      { value: "light-green", label: m.slides.mbolster.caseTypes[1] ?? "Bolster + Inner Protector + Light Green Case" },
      { value: "light-blue", label: m.slides.mbolster.caseTypes[2] ?? "Bolster + Inner Protector + Light Blue Case" },
    ],
    [m],
  );

  const [progress, setProgress] = React.useState(0);
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<string>("size-s");
  const [caseType, setCaseType] = React.useState<string>("camel");
  const [galleryIdx, setGalleryIdx] = React.useState(0);

  const setViewportNode = React.useCallback((node: HTMLDivElement | null) => {
    setViewportEl(node);
  }, []);

  React.useEffect(() => {
    const viewport = viewportEl;
    if (!viewport) return;

    let raf = 0;
    const update = () => {
      const max = viewport.scrollHeight - viewport.clientHeight;
      const pct = max > 0 ? (viewport.scrollTop / max) * 100 : 0;
      setProgress(Math.max(0, Math.min(100, pct)));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, [viewportEl]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-9 px-4 py-2", className)}>
          {label}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        disableMobileBottom
        hideClose
        className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
      >
        {/* Framed shell: inner rounded panel */}
        <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
            <SheetHeader className="relative pr-12 px-4 py-4 md:px-8 md:py-6">
              <SheetTitle>{m.slides.mbolster.title}</SheetTitle>
              <SheetDescription>{m.slides.mbolster.description}</SheetDescription>

              <SheetClose asChild>
                <button
                  type="button"
                  className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
                >
                  <XIcon className="size-4" />
                  <span className="sr-only">{m.common.close}</span>
                </button>
              </SheetClose>
            </SheetHeader>

            <div className="px-4 pb-4 md:px-8 md:pb-5">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          {/* Content area fills remaining height */}
          <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-4 py-5 md:px-8 md:py-8">
              <main className="min-w-0">
                {/* Hero (matches product page top content) */}
                <section className="py-10 md:py-16">
                  <div className="space-y-6">
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/808907f4-ac2b-499a-ace6-69933883b2f5.webp"
                        alt="Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                        priority={false}
                      />
                    </AspectRatio>

                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.heroLabel}</p>
                      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                        {m.slides.mbolster.heroTitle}
                      </h2>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.heroDescription}
                      </p>
                    </header>

                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.zoomLabel}</div>

                      <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-xl border bg-card">
                        <Image
                          src={MBOLSTER_GALLERY[galleryIdx]?.src ?? "/MpillowIGPostMay2025.zip-2.webp"}
                          alt={MBOLSTER_GALLERY[galleryIdx]?.alt ?? "Customised Bolsters - Mbolster"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 640px"
                        />
                      </AspectRatio>

                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {MBOLSTER_GALLERY.map((m, idx) => (
                          <button
                            key={m.src}
                            type="button"
                            onClick={() => setGalleryIdx(idx)}
                            className={cn(
                              "focus-visible:ring-ring focus-visible:ring-offset-background relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/20 ring-offset-2 focus-visible:ring-2 focus-visible:outline-hidden",
                              idx === galleryIdx ? "border-foreground/40" : "border-border",
                            )}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <Image src={m.src} alt={m.alt} fill className="object-cover" sizes="64px" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm">
                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.salePriceLabel}</div>
                          <div className="text-3xl font-bold tabular-nums">$135.00 SGD</div>
                          <div className="mt-1 text-sm text-muted-foreground">{m.slides.mbolster.reviewCountLabel}</div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link
                              href="https://www.mpillow.com/products/bolsters"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {m.common.addToCart}
                            </Link>
                          </Button>
                          <Button asChild variant="secondary">
                            <Link href={to("/mbolster-config")}>{m.common.customise}</Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link
                              href="https://www.mpillow.com/pages/contact"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {m.common.bookAppointment}
                            </Link>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">{m.slides.mbolster.sizeLabel}</div>
                          <Select value={size} onValueChange={setSize}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={m.slides.mbolster.sizePlaceholder} />
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
                          <div className="text-sm font-medium text-foreground">{m.slides.mbolster.caseTypeLabel}</div>
                          <Select value={caseType} onValueChange={setCaseType}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={m.slides.mbolster.caseTypePlaceholder} />
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

                      <div className="mt-4 text-sm text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.purchaseNote}{" "}
                        <Link
                          className="underline underline-offset-4"
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {m.slides.mbolster.purchaseLinkLabel}
                        </Link>
                        .
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.viewDetailsLabel}</p>
                      <SectionTitle>{m.slides.mbolster.aboutTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.aboutParagraphs[0]}
                      </p>
                    </header>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      {m.slides.mbolster.aboutParagraphs.slice(1).map((text, idx) => (
                        <p key={idx}>{text}</p>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.sizeGuideTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.sizeGuideDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/bolster_mbolster_size.webp"
                        alt="Mbolster size guide"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {m.slides.mbolster.sizeGuideItems.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.packagingTitle}</SectionTitle>
                    </header>

                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {m.slides.mbolster.packagingItems.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>

                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm font-semibold text-foreground">{m.slides.mbolster.fillingsTitle}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{m.slides.mbolster.fillingsDescription}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {m.slides.mbolster.packagingNote}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.reviewsTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">{m.slides.mbolster.reviewsBasedOn}</p>
                    </header>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border bg-card/40 p-4">
                        <div className="text-sm font-semibold text-foreground">{m.slides.mbolster.reviewTitle}</div>
                        <div className="mt-2 text-sm text-muted-foreground">{m.slides.mbolster.reviewText}</div>
                        <div className="mt-3 text-xs text-muted-foreground">{m.slides.mbolster.reviewAttribution}</div>
                      </div>

                      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                        <div className="font-semibold text-foreground">{m.slides.mbolster.ratingBreakdown}</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[0]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[1]}</span>
                            <span className="tabular-nums">100%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[2]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[3]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[4]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5110.webp"
                        alt="Mbolster photo"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.modularTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.modularDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/fillings.webp"
                        alt="Modular waterproof fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.customiseTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.customiseDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Mpillow_IG_Post_May_2025.webp"
                        alt="Customise your Mbolster with us"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link href={to("/mbolster-config")}>{m.common.customise}</Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href="https://www.mpillow.com/pages/contact" target="_blank" rel="noopener noreferrer">
                          {m.common.bookAppointment}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.fillingsSectionTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.fillingsSectionDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/wash-care.webp"
                        alt="Wash care"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.discoverTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.discoverParagraphs[0]}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5097.jpg"
                        alt="Discover the Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>{m.slides.mbolster.discoverParagraphs[1]}</p>
                      <p>{m.slides.mbolster.discoverParagraphs[2]}</p>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Bolster_Fillings_gif.webp"
                        alt="Bolster fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {m.slides.mbolster.discoverButton}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

              </main>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MbolsterLearnMoreSheet({ open, onOpenChange }: ControlledSheetProps) {
  const { m, locale } = useI18n();
  const to = React.useCallback((href: string) => withLocale(href, locale), [locale]);

  const sizeOptions = React.useMemo<Option[]>(
    () => [
      { value: "size-s", label: m.slides.mbolster.sizes[0] ?? "Size S (D15 × 0.8m)" },
      { value: "size-m", label: m.slides.mbolster.sizes[1] ?? "Size M (D20 × 1.0m)" },
      { value: "size-l", label: m.slides.mbolster.sizes[2] ?? "Size L (D20 × 1.2m)" },
    ],
    [m],
  );

  const caseTypeOptions = React.useMemo<Option[]>(
    () => [
      { value: "camel", label: m.slides.mbolster.caseTypes[0] ?? "Bolster + Inner Protector + Camel Case" },
      { value: "light-green", label: m.slides.mbolster.caseTypes[1] ?? "Bolster + Inner Protector + Light Green Case" },
      { value: "light-blue", label: m.slides.mbolster.caseTypes[2] ?? "Bolster + Inner Protector + Light Blue Case" },
    ],
    [m],
  );

  const [progress, setProgress] = React.useState(0);
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<string>("size-s");
  const [caseType, setCaseType] = React.useState<string>("camel");
  const [galleryIdx, setGalleryIdx] = React.useState(0);

  const setViewportNode = React.useCallback((node: HTMLDivElement | null) => {
    setViewportEl(node);
  }, []);

  React.useEffect(() => {
    const viewport = viewportEl;
    if (!viewport) return;

    let raf = 0;
    const update = () => {
      const max = viewport.scrollHeight - viewport.clientHeight;
      const pct = max > 0 ? (viewport.scrollTop / max) * 100 : 0;
      setProgress(Math.max(0, Math.min(100, pct)));
    };

    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };

    update();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
    };
  }, [viewportEl]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        disableMobileBottom
        hideClose
        className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
      >
        {/* Framed shell: inner rounded panel */}
        <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
            <SheetHeader className="relative pr-12 px-4 py-4 md:px-8 md:py-6">
              <SheetTitle>{m.slides.mbolster.title}</SheetTitle>
              <SheetDescription>{m.slides.mbolster.description}</SheetDescription>

              <SheetClose asChild>
                <button
                  type="button"
                  className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
                >
                  <XIcon className="size-4" />
                  <span className="sr-only">{m.common.close}</span>
                </button>
              </SheetClose>
            </SheetHeader>

            <div className="px-4 pb-4 md:px-8 md:pb-5">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          {/* Content area fills remaining height */}
          <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-4 py-5 md:px-8 md:py-8">
              <main className="min-w-0">
                {/* Hero (matches product page top content) */}
                <section className="py-10 md:py-16">
                  <div className="space-y-6">
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/808907f4-ac2b-499a-ace6-69933883b2f5.webp"
                        alt="Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                        priority={false}
                      />
                    </AspectRatio>

                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.heroLabel}</p>
                      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                        {m.slides.mbolster.heroTitle}
                      </h2>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.heroDescription}
                      </p>
                    </header>

                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.zoomLabel}</div>

                      <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-xl border bg-card">
                        <Image
                          src={MBOLSTER_GALLERY[galleryIdx]?.src ?? "/MpillowIGPostMay2025.zip-2.webp"}
                          alt={MBOLSTER_GALLERY[galleryIdx]?.alt ?? "Customised Bolsters - Mbolster"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 640px"
                        />
                      </AspectRatio>

                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {MBOLSTER_GALLERY.map((m, idx) => (
                          <button
                            key={m.src}
                            type="button"
                            onClick={() => setGalleryIdx(idx)}
                            className={cn(
                              "focus-visible:ring-ring focus-visible:ring-offset-background relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/20 ring-offset-2 focus-visible:ring-2 focus-visible:outline-hidden",
                              idx === galleryIdx ? "border-foreground/40" : "border-border",
                            )}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <Image src={m.src} alt={m.alt} fill className="object-cover" sizes="64px" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm">
                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.salePriceLabel}</div>
                          <div className="text-3xl font-bold tabular-nums">$135.00 SGD</div>
                          <div className="mt-1 text-sm text-muted-foreground">{m.slides.mbolster.reviewCountLabel}</div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link
                              href="https://www.mpillow.com/products/bolsters"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {m.common.addToCart}
                            </Link>
                          </Button>
                          <Button asChild variant="secondary">
                            <Link href={to("/mbolster-config")}>{m.common.customise}</Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link
                              href="https://www.mpillow.com/pages/contact"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {m.common.bookAppointment}
                            </Link>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">{m.slides.mbolster.sizeLabel}</div>
                          <Select value={size} onValueChange={setSize}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={m.slides.mbolster.sizePlaceholder} />
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
                          <div className="text-sm font-medium text-foreground">{m.slides.mbolster.caseTypeLabel}</div>
                          <Select value={caseType} onValueChange={setCaseType}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={m.slides.mbolster.caseTypePlaceholder} />
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

                      <div className="mt-4 text-sm text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.purchaseNote}{" "}
                        <Link
                          className="underline underline-offset-4"
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {m.slides.mbolster.purchaseLinkLabel}
                        </Link>
                        .
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">{m.slides.mbolster.viewDetailsLabel}</p>
                      <SectionTitle>{m.slides.mbolster.aboutTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.aboutParagraphs[0]}
                      </p>
                    </header>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      {m.slides.mbolster.aboutParagraphs.slice(1).map((text, idx) => (
                        <p key={idx}>{text}</p>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.sizeGuideTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.sizeGuideDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/bolster_mbolster_size.webp"
                        alt="Mbolster size guide"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {m.slides.mbolster.sizeGuideItems.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.packagingTitle}</SectionTitle>
                    </header>

                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {m.slides.mbolster.packagingItems.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>

                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm font-semibold text-foreground">{m.slides.mbolster.fillingsTitle}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{m.slides.mbolster.fillingsDescription}</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {m.slides.mbolster.packagingNote}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.reviewsTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">{m.slides.mbolster.reviewsBasedOn}</p>
                    </header>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border bg-card/40 p-4">
                        <div className="text-sm font-semibold text-foreground">{m.slides.mbolster.reviewTitle}</div>
                        <div className="mt-2 text-sm text-muted-foreground">{m.slides.mbolster.reviewText}</div>
                        <div className="mt-3 text-xs text-muted-foreground">{m.slides.mbolster.reviewAttribution}</div>
                      </div>

                      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                        <div className="font-semibold text-foreground">{m.slides.mbolster.ratingBreakdown}</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[0]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[1]}</span>
                            <span className="tabular-nums">100%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[2]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[3]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>{m.slides.mbolster.stars[4]}</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5110.webp"
                        alt="Mbolster photo"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.modularTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.modularDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/fillings.webp"
                        alt="Modular waterproof fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.customiseTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.customiseDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Mpillow_IG_Post_May_2025.webp"
                        alt="Customise your Mbolster with us"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link href={to("/mbolster-config")}>{m.common.customise}</Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href="https://www.mpillow.com/pages/contact" target="_blank" rel="noopener noreferrer">
                          {m.common.bookAppointment}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.fillingsSectionTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.fillingsSectionDescription}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/wash-care.webp"
                        alt="Wash care"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>{m.slides.mbolster.discoverTitle}</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        {m.slides.mbolster.discoverParagraphs[0]}
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5097.jpg"
                        alt="Discover the Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>{m.slides.mbolster.discoverParagraphs[1]}</p>
                      <p>{m.slides.mbolster.discoverParagraphs[2]}</p>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Bolster_Fillings_gif.webp"
                        alt="Bolster fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {m.slides.mbolster.discoverButton}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>
              </main>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

