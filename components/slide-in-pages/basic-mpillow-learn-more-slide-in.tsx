"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { FirmnessScale } from "@/components/firmness-scale";
import { LeftContentRightImgSection } from "@/components/sections/left-content-right-img-section";
import { Carousel } from "@/components/ui/apple-cards-carousel";
import { openBookAppointmentSheet } from "@/components/slide-in-pages/book-appointment-sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import { withLocale } from "@/lib/i18n/routing";
import { useI18n } from "@/lib/i18n/use-i18n";

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

function AppleCarouselInfoCard({
  title,
  description,
  imageSrc,
  imageAlt,
}: {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
}) {
  return (
    <div className="flex w-72 flex-col overflow-hidden rounded-3xl bg-gray-100 dark:bg-neutral-900 md:w-96">
      <div className="relative aspect-[16/10]">
        <Image src={imageSrc} alt={imageAlt} fill className="object-cover" sizes="(min-width: 768px) 384px, 288px" />
      </div>
      <div className="space-y-1.5 p-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-sm leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

function BasicMpillowLearnMoreSheetInner() {
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
            <SheetTitle>{m.slides.basicMpillow.title}</SheetTitle>
            <SheetDescription>
              {m.slides.basicMpillow.description}
            </SheetDescription>

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
                <LeftContentRightImgSection
                  title={m.slides.basicMpillow.heroTitle}
                  description={
                    <>
                      {m.slides.basicMpillow.heroParagraphs.map((text, idx) => (
                        <p key={idx}>{text}</p>
                      ))}

                      <div className="space-y-2 pt-2">
                        <div className="text-sm font-semibold text-foreground">{m.slides.basicMpillow.packagingTitle}</div>
                        <ul className="space-y-1.5">
                          {m.slides.basicMpillow.packagingItems.map((text) => (
                            <li key={text}>{text}</li>
                          ))}
                        </ul>
                      </div>
                    </>
                  }
                  cta={
                    <Button asChild className="h-auto py-3">
                      <Link href={to("/mp-basic")}>{m.slides.basicMpillow.bottomCustomise}</Link>
                    </Button>
                  }
                  image={{
                    src: "/m-pillow-518001-final-WEB.webp",
                    alt: "Basic Mpillow",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                  }}
                />

                <section className="px-4 md:px-6 space-y-3">
                  <div className="grid gap-4 md:grid-cols-2 md:items-start">
                    <div className="space-y-2">
                      <SectionTitle>{m.slides.basicMpillow.firmnessTitle}</SectionTitle>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {m.slides.basicMpillow.firmnessDescription}
                      </p>
                    </div>

                    <div className="w-full space-y-3">
                      <FirmnessScale
                        mode="range"
                        value={[25, 35]}
                        title={m.slides.basicMpillow.firmnessBasicLabel}
                        label="25–35%"
                        className="w-full"
                      />
                      <FirmnessScale
                        mode="range"
                        value={[40, 85]}
                        title={m.slides.basicMpillow.firmnessPremiumLabel}
                        label="40–85%"
                        className="w-full"
                      />
                    </div>
                  </div>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <Carousel
                    itemsContainerClassName="w-full px-0 mx-0 max-w-none"
                    items={[
                      ...m.slides.basicMpillow.features.map((f, idx) => {
                        const media = [
                          { imageSrc: "/basic-mpillow.webp", imageAlt: "Basic Mpillow ergonomic support" },
                          { imageSrc: "/Square_3waysleep.webp", imageAlt: "Patented M design" },
                          { imageSrc: "/001.webp", imageAlt: "Modular components" },
                          { imageSrc: "/wash-care.webp", imageAlt: "Wash care" },
                        ][idx];
                        return (
                          <AppleCarouselInfoCard
                            key={`basic-feature-${idx}`}
                            title={f.title}
                            description={f.description}
                            imageSrc={media?.imageSrc ?? "/basic-mpillow.webp"}
                            imageAlt={media?.imageAlt ?? "Basic Mpillow"}
                          />
                        );
                      }),
                    ]}
                  />
                </section>

                <LeftContentRightImgSection
                  sectionProps={{ "data-section": "size-does-matter" }}
                  headerProps={{ "data-section-header": "size-does-matter" }}
                  className="space-y-3"
                  gridClassName="gap-3 md:items-start"
                  headerClassName="space-y-2"
                  flip
                  title={m.slides.basicMpillow.sizeTitle}
                  titleAs="h3"
                  titleClassName="text-lg font-semibold tracking-tight md:text-xl"
                  description={
                    <>
                      <p>{m.slides.basicMpillow.sizeDescription}</p>

                      <div className="overflow-hidden rounded-xl">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/30">
                            <tr className="text-left">
                              <th className="px-3 py-2.5 font-semibold">{m.slides.basicMpillow.sizeTable.sizeHeader}</th>
                              <th className="px-3 py-2.5 font-semibold">
                                {m.slides.basicMpillow.sizeTable.shoulderHeader}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="[&>tr:not(:last-child)]:border-b">
                            {m.slides.basicMpillow.sizeTable.rows.map((row) => (
                              <tr key={row.size}>
                                <td className="px-3 py-2.5 font-medium">{row.size}</td>
                                <td className="px-3 py-2.5 text-muted-foreground">{row.shoulder}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  }
                  imageWrapperClassName="aspect-[600/619] border-0 bg-muted/20"
                  image={{
                    src: "/sizecomparison.webp",
                    alt: "Why sizing matters",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                    className: "object-contain",
                  }}
                />

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>{m.slides.basicMpillow.sizingChartTitle}</SectionTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {m.slides.basicMpillow.sizingChartDescription}
                  </p>

                  <div className="overflow-hidden rounded-xl border bg-card">
                    <div className="relative aspect-video bg-muted/20">
                      <YouTubeAutoplayOnView
                        videoId="r9XfezALQhA"
                        title={m.slides.basicMpillow.sizingChartTitle}
                      />
                    </div>
                  </div>
                </section>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="px-4 py-4 md:px-6">
            <div className="grid gap-3 sm:grid-cols-2 md:flex md:flex-wrap md:gap-3">
              <Button asChild className="h-auto py-4 md:h-9 md:py-2">
                <Link href={to("/mp-basic")}>{m.slides.basicMpillow.bottomCustomise}</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-auto py-4 md:h-9 md:py-2"
                onClick={openBookAppointmentSheet}
              >
                {m.slides.basicMpillow.bookAdjustment}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}

export function BasicMpillowLearnMoreSheet({ open, onOpenChange, children, className, triggerLabel }: Props) {
  const { m } = useI18n();
  const label = triggerLabel ?? m.slides.basicMpillow.trigger;
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
      <BasicMpillowLearnMoreSheetInner />
    </Sheet>
  );
}

