"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { FirmnessScale } from "@/components/firmness-scale";
import { Button, buttonVariants } from "@/components/ui/button";
import { AppleCarouselCard, type AppleCarouselCardData, Carousel } from "@/components/ui/apple-cards-carousel";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";
import { openCervicalNeckSupportSheet } from "@/components/slide-in-pages/cervical-neck-support";

type Props = {
  className?: string;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-foreground">{children}</div>;
}

function PremiumLearnMoreSheetInner() {
  const { m, locale } = useI18n();
  const to = React.useCallback((href: string) => withLocale(href, locale), [locale]);

  const [progress, setProgress] = React.useState(0);
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);

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
    <SheetContent
      side="right"
      mobilePreset="full"
      animation="fade-up"
      hideClose
      className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
    >
      {/* Framed shell: inner rounded panel */}
      <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
          <SheetHeader className="relative pr-12 px-4 py-4 md:px-8 md:py-6">
            <SheetTitle>{m.slides.premiumMpillow.title}</SheetTitle>
            <SheetDescription>{m.slides.premiumMpillow.description}</SheetDescription>

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

        <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="p-0">
            <div className="space-y-10 pb-28">
              <section className="px-4 pt-5 md:px-6">
                <div className="space-y-4">
                  <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/m-pillow-317460-final---H-WEB.webp"
                      alt="Premium Mpillow hero"
                      fill
                      className="object-cover"
                      sizes="100vw"
                      priority={false}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 md:items-start">
                    <div className="space-y-2">
                      <SectionSubtitle>{m.slides.premiumMpillow.heroSubtitle}</SectionSubtitle>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {m.slides.premiumMpillow.heroParagraphs[0]}
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {m.slides.premiumMpillow.heroParagraphs[1]}
                      </p>
                      <div className="w-full space-y-3">
                        <FirmnessScale
                          mode="range"
                          value={[40, 85]}
                          title={m.slides.basicMpillow.firmnessPremiumLabel}
                          label="40–85%"
                          className="w-full"
                        />
                        <FirmnessScale
                          mode="range"
                          value={[25, 35]}
                          title={m.slides.basicMpillow.firmnessBasicLabel}
                          label="25–35%"
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/m-pillow-317409-final---H-WEB.webp"
                        alt="Premium Mpillow in-store customisation"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                        priority={false}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6">
                <div className="grid gap-4 md:grid-cols-2 md:items-center">
                  <div className="space-y-2">
                    <SectionTitle>{m.slides.premiumMpillow.overseasTitle}</SectionTitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.premiumMpillow.overseasDescription}
                    </p>
                    <div className="pt-1">
                      <SheetClose asChild>
                        <Button asChild className="h-auto py-3">
                          <Link href={to("/mp-config")}>{m.common.customise}</Link>
                        </Button>
                      </SheetClose>
                    </div>
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/m-pillow-417953-web.webp"
                      alt="Overseas customisation"
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.accessoryTitle}</SectionTitle>
                <div className="grid gap-4 md:grid-cols-2 md:items-center">
                  <div className="space-y-2">
                    <SectionSubtitle>{m.slides.premiumMpillow.accessorySubtitle}</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.premiumMpillow.accessoryDescription}
                    </p>
                    <SheetClose asChild>
                      <Link
                        href="https://www.mpillow.com/pages/cervical-support-pillow-customisable-pillow"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.preventDefault();
                          openCervicalNeckSupportSheet();
                        }}
                        className={cn(buttonVariants({ variant: "outline", className: "h-auto py-3" }))}
                      >
                        {m.slides.premiumMpillow.accessoryButton}
                      </Link>
                    </SheetClose>
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/mpillow-cervical-neck.webp"
                      alt="Cervical neck support accessory"
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.whoItsForTitle}</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {m.slides.premiumMpillow.whoItsForIntro}
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {m.slides.premiumMpillow.whoItsForItems.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {m.slides.premiumMpillow.whoItsForConclusion}
                </p>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.pricingTitle}</SectionTitle>
                <div className="overflow-hidden rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr className="text-left">
                        <th className="px-3 py-2.5 font-semibold">{m.slides.premiumMpillow.pricingTable.sizeHeader}</th>
                        <th className="px-3 py-2.5 font-semibold">{m.slides.premiumMpillow.pricingTable.priceHeader}</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr:not(:last-child)]:border-b">
                      <tr>
                        <td className="px-3 py-2.5 font-medium">XS</td>
                        <td className="px-3 py-2.5 text-muted-foreground">$340–$360</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 font-medium">S</td>
                        <td className="px-3 py-2.5 text-muted-foreground">$400–$430</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 font-medium">M</td>
                        <td className="px-3 py-2.5 text-muted-foreground">$430–$460</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 font-medium">L</td>
                        <td className="px-3 py-2.5 text-muted-foreground">$580–$610</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2.5 font-medium">XL</td>
                        <td className="px-3 py-2.5 text-muted-foreground">$680</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {m.slides.premiumMpillow.pricingNotes.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.featuresTitle}</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {m.slides.premiumMpillow.featuresIntro}
                </p>

                <Carousel
                  items={(
                    [
                      {
                        src: "/NeckDepth.webp",
                        title: m.slides.premiumMpillow.features[0]?.title ?? "Feature 1",
                        category: "",
                        content: (
                          <p className="text-muted-foreground">{m.slides.premiumMpillow.features[0]?.description ?? ""}</p>
                        ),
                      },
                      {
                        src: "/3_compartment.webp",
                        title: m.slides.premiumMpillow.features[1]?.title ?? "Feature 2",
                        category: "",
                        content: (
                          <p className="text-muted-foreground">{m.slides.premiumMpillow.features[1]?.description ?? ""}</p>
                        ),
                      },
                      {
                        src: "/m-pillow-518057-final-V-WEB.webp",
                        title: m.slides.premiumMpillow.features[2]?.title ?? "Feature 3",
                        category: "",
                        content: (
                          <p className="text-muted-foreground">{m.slides.premiumMpillow.features[2]?.description ?? ""}</p>
                        ),
                      },
                      {
                        src: "/wash-care.webp",
                        title: m.slides.premiumMpillow.features[3]?.title ?? "Feature 4",
                        category: "",
                        content: (
                          <p className="text-muted-foreground">{m.slides.premiumMpillow.features[3]?.description ?? ""}</p>
                        ),
                      },
                      {
                        src: "/fillings.webp",
                        title: m.slides.premiumMpillow.features[4]?.title ?? "Feature 5",
                        category: "",
                        content: (
                          <p className="text-muted-foreground">{m.slides.premiumMpillow.features[4]?.description ?? ""}</p>
                        ),
                      },
                    ] satisfies AppleCarouselCardData[]
                  ).map((card, index) => (
                    <AppleCarouselCard key={`${index}-${card.title}`} card={card} index={index} layout variant="stacked" />
                  ))}
                  itemsContainerClassName="pl-0 mx-0 max-w-none"
                />
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <div className="grid gap-4 md:grid-cols-2 md:items-start">
                  <div className="space-y-2">
                    <SectionTitle>{m.slides.premiumMpillow.firmnessTitle}</SectionTitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.premiumMpillow.firmnessDescription}
                    </p>
                  </div>

                  <div className="w-full">
                    <FirmnessScale
                      mode="range"
                      value={[40, 85]}
                      title={m.slides.premiumMpillow.title}
                      label="40–85%"
                      className="w-full"
                    />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.videoTitle}</SectionTitle>
                <div className="overflow-hidden rounded-xl border bg-card">
                  <div className="relative aspect-video bg-muted/20">
                    <YouTubeAutoplayOnView
                      videoId="V2H03lq9IYU"
                      title={m.slides.premiumMpillow.videoTitle}
                    />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.measurementsTitle}</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {m.slides.premiumMpillow.measurementsIntro}
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <SectionSubtitle>{m.slides.premiumMpillow.measurementSteps[0]?.title ?? ""}</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.premiumMpillow.measurementSteps[0]?.description ?? ""}
                    </p>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/shoulderlength_800x.webp"
                        alt="How to measure shoulder length"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <SectionSubtitle>{m.slides.premiumMpillow.measurementSteps[1]?.title ?? ""}</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.premiumMpillow.measurementSteps[1]?.description ?? ""}
                    </p>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/NeckDepth_800x.webp"
                        alt="How to measure neck depth"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <SectionSubtitle>{m.slides.premiumMpillow.measurementSteps[2]?.title ?? ""}</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.premiumMpillow.measurementSteps[2]?.description ?? ""}
                    </p>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/HeadDepth_800x.webp"
                        alt="How to measure head depth"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <SectionSubtitle>{m.slides.premiumMpillow.measurementSteps[3]?.title ?? ""}</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.premiumMpillow.measurementSteps[3]?.description ?? ""}
                    </p>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/necklength_800x.webp"
                        alt="How to measure neck length"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.packageTitle}</SectionTitle>
                <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                  <Image
                    src="/m-pillow-417804-final-WEB.webp"
                    alt="Premium Mpillow package"
                    fill
                    className="object-cover"
                    sizes="(min-width: 768px) 70vw, 100vw"
                  />
                </div>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {m.slides.premiumMpillow.packageItems.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.aftercareTitle}</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">{m.slides.premiumMpillow.aftercareDescription}</p>
                <div className="overflow-hidden rounded-xl border bg-card">
                  <div className="relative aspect-video bg-muted/20">
                    <YouTubeAutoplayOnView
                      videoId="LxtHJL9s58E"
                      title={m.slides.premiumMpillow.aftercareTitle}
                    />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>{m.slides.premiumMpillow.commitmentTitle}</SectionTitle>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground">{m.slides.premiumMpillow.commitmentReadjustmentTitle}</div>
                    <p className="leading-relaxed">
                      {m.slides.premiumMpillow.commitmentReadjustmentDescription}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground">{m.slides.premiumMpillow.commitmentWarrantyTitle}</div>
                    <p className="leading-relaxed">
                      {m.slides.premiumMpillow.commitmentWarrantyDescription}
                    </p>
                  </div>
                </div>
                <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                  <Image src="/DSC03705.webp" alt="Premium Mpillow commitment" fill className="object-cover" sizes="(min-width: 768px) 70vw, 100vw" />
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-2">
                <SectionTitle>{m.slides.premiumMpillow.helpTitle}</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">{m.slides.premiumMpillow.helpDescription}</p>
              </section>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="px-4 py-4 md:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild className="h-auto py-4">
                <Link href={to("/mp-config")}>{m.common.customise}</Link>
              </Button>
              <Button asChild variant="outline" className="h-auto py-4">
                <Link href="https://www.mpillow.com/pages/book-online" target="_blank" rel="noopener noreferrer">
                  {m.slides.premiumMpillow.bottomBookBespoke}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}

export function PremiumLearnMoreSheet({ open, onOpenChange, children, className, triggerLabel }: Props) {
  const { m } = useI18n();
  const label = triggerLabel ?? m.slides.premiumMpillow.trigger;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {open === undefined && (
        <SheetTrigger asChild>
          {children ?? (
            <Button variant="secondary" className={cn("h-auto py-2.5", className)}>
              {label}
            </Button>
          )}
        </SheetTrigger>
      )}
      <PremiumLearnMoreSheetInner />
    </Sheet>
  );
}

