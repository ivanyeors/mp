"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, Carousel, MeasureTile } from "@/components/ui/apple-cards-carousel";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, sheetStickyBottomClassName, sheetStickyTopClassName } from "@/components/ui/sheet";
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss";
import DecryptedText from "@/components/effects/DecryptedText";
import { LeftContentRightImgSection } from "@/components/sections/left-content-right-img-section";
import SpotlightCard from "@/components/effects/SpotlightCard";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";

type Props = {
  className?: string;
};

export function SizeMattersSlideIn({ className }: Props) {
  const { m } = useI18n();
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
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-auto px-6 py-4 text-base", className)}>
          {m.slides.sizeMatters.trigger}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        mobilePreset="full"
        insetTopPadding={false}
        animation="fade-up"
        hideClose
        className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
      >
        {/* Framed shell: inner rounded panel */}
        <div className="flex h-[100dvh] flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className={sheetStickyTopClassName}>
            <SheetHeader className="relative px-4 py-4 md:px-8 md:py-6 md:pr-12">
              <SheetTitle>{m.slides.sizeMatters.title}</SheetTitle>
              <SheetDescription>{m.slides.sizeMatters.description}</SheetDescription>

              <SheetClose asChild>
                <OverlayDismissButton label={m.common.close} className="hidden md:inline-flex" />
              </SheetClose>
            </SheetHeader>
            <div className="px-4 pb-4 md:px-8 md:pb-5">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          <div ref={setViewportNode} className="flex-1 overflow-y-auto">
            <div className="px-4 py-5 md:px-6 md:py-6">
              <main className="min-w-0 space-y-8" aria-label="Mpillow sizing and fit">
                <section
                  aria-labelledby="press-quote-heading"
                  className="mx-auto max-w-3xl py-[42px] animate-in fade-in duration-700 space-y-3 text-center"
                >
                  <h2 id="press-quote-heading" className="sr-only">
                    Press quote
                  </h2>
                  <p className="text-2xl font-semibold leading-relaxed tracking-tight sm:text-2xl md:text-4xl">
                    <DecryptedText
                      text={m.slides.sizeMatters.pressQuote.text}
                      animateOn="view"
                      sequential
                      speed={20}
                      loop
                      loopDelay={5000}
                    />
                  </p>
                  <footer className="text-sm text-muted-foreground">{m.slides.sizeMatters.pressQuote.attribution}</footer>
                </section>

                <section aria-labelledby="size-matters-heading" className="grid gap-6 md:grid-cols-2 md:items-center">
                  <div className="space-y-2">
                    <h2 id="size-matters-heading" className="text-lg font-semibold leading-tight">
                      {m.slides.sizeMatters.sectionSizeMattersTitle}
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {m.slides.sizeMatters.sectionSizeMattersDescription}
                    </p>
                  </div>
                  <div className="overflow-hidden rounded-xl bg-muted/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/sizecomparison.webp"
                      alt="Mpillow sizing and fit"
                      className="block w-full h-auto"
                      loading="lazy"
                    />
                  </div>
                </section>

                <section aria-labelledby="measurements-heading">
                  <Card className="rounded-none border-0 bg-transparent py-0 shadow-none gap-3">
                    <CardHeader className="px-0">
                      <h2 id="measurements-heading" className="leading-none font-semibold">
                        {m.slides.sizeMatters.measurementsTitle}
                      </h2>
                    </CardHeader>
                    <CardContent className="px-0 space-y-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {m.slides.sizeMatters.measurementsIntro}
                      </p>
                      <Carousel
                        itemsContainerClassName="w-full px-0 mx-0 max-w-none"
                        items={[
                          <SpotlightCard
                            key="measure-shoulder"
                            className="flex w-[450px] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
                            data-ui="size-matters-measurement-card"
                          >
                            <MeasureTile
                              iconSrc="/shoulder-length.svg"
                              title={m.slides.sizeMatters.measurementCards[0]?.title ?? ""}
                              description={m.slides.sizeMatters.measurementCards[0]?.description ?? ""}
                            />
                          </SpotlightCard>,
                          <SpotlightCard
                            key="measure-neck-length"
                            className="flex w-[450px] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
                            data-ui="size-matters-measurement-card"
                          >
                            <MeasureTile
                              iconSrc="/neck-length.svg"
                              title={m.slides.sizeMatters.measurementCards[1]?.title ?? ""}
                              description={m.slides.sizeMatters.measurementCards[1]?.description ?? ""}
                            />
                          </SpotlightCard>,
                          <SpotlightCard
                            key="measure-neck-depth"
                            className="flex w-[450px] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
                            data-ui="size-matters-measurement-card"
                          >
                            <MeasureTile
                              iconSrc="/neck-to-back.svg"
                              title={m.slides.sizeMatters.measurementCards[2]?.title ?? ""}
                              description={m.slides.sizeMatters.measurementCards[2]?.description ?? ""}
                            />
                          </SpotlightCard>,
                          <SpotlightCard
                            key="measure-head-depth"
                            className="flex w-[450px] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
                            data-ui="size-matters-measurement-card"
                          >
                            <MeasureTile
                              iconSrc="/head-to-back.svg"
                              title={m.slides.sizeMatters.measurementCards[3]?.title ?? ""}
                              description={m.slides.sizeMatters.measurementCards[3]?.description ?? ""}
                            />
                          </SpotlightCard>,
                        ]}
                      />
                    </CardContent>
                  </Card>
                </section>

                <section aria-labelledby="head-shapes-heading">
                  <Card className="rounded-none border-0 bg-transparent py-0 shadow-none gap-3">
                    <CardContent className="px-0 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2 md:items-center">
                        <div className="space-y-2">
                          <h2 id="head-shapes-heading" className="leading-none font-semibold">
                            {m.slides.sizeMatters.headShapesTitle}
                          </h2>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            {m.slides.sizeMatters.headShapesDescription}
                          </p>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/Head-Shapes-GIF.gif"
                          alt="Head shapes and support examples"
                          className="w-full h-auto rounded-xl bg-muted/20"
                          loading="lazy"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <LeftContentRightImgSection
                  sectionProps={{ "aria-labelledby": "why-unique-heading", className: "px-0 md:px-0 space-y-0" }}
                  headerClassName="space-y-2"
                  titleAs="h2"
                  title={m.slides.sizeMatters.whyUniqueTitle}
                  titleProps={{ id: "why-unique-heading" }}
                  titleClassName="leading-none font-semibold text-base tracking-normal md:text-base"
                  description={
                    <>
                      <p>{m.slides.sizeMatters.whyUniqueDescription}</p>
                    </>
                  }
                  image={{
                    src: "/five-sizes.webp",
                    alt: "Five Mpillow size options",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                  }}
                  imageWrapperClassName="border-0 bg-muted/20"
                />

                <LeftContentRightImgSection
                  sectionProps={{ "aria-labelledby": "sleep-position-heading", className: "px-0 md:px-0 space-y-0" }}
                  headerClassName="space-y-2"
                  titleAs="h2"
                  title={m.slides.sizeMatters.sleepPositionTitle}
                  titleProps={{ id: "sleep-position-heading" }}
                  titleClassName="leading-none font-semibold text-base tracking-normal md:text-base"
                  description={
                    <>
                      <p>{m.slides.sizeMatters.sleepPositionParagraphs[0]}</p>
                      <p>{m.slides.sizeMatters.sleepPositionParagraphs[1]}</p>
                    </>
                  }
                  image={{
                    src: "/stitch-inner-component.webp",
                    alt: "Mpillow inner component stitching",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                  }}
                  imageWrapperClassName="border-0 bg-muted/20"
                />

                <LeftContentRightImgSection
                  sectionProps={{ "aria-labelledby": "unique-configurations-heading", className: "px-0 md:px-0 space-y-0" }}
                  headerClassName="space-y-2"
                  titleAs="h2"
                  title={m.slides.sizeMatters.configurationsTitle}
                  titleProps={{ id: "unique-configurations-heading" }}
                  titleClassName="leading-none font-semibold text-base tracking-normal md:text-base"
                  description={
                    <>
                      <p>{m.slides.sizeMatters.configurationsParagraphs[0]}</p>
                      <p>{m.slides.sizeMatters.configurationsParagraphs[1]}</p>
                    </>
                  }
                  image={{
                    src: "/diff-body-back-sleep.webp",
                    alt: "Different body types and back sleeping support",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                  }}
                  imageWrapperClassName="border-0 bg-muted/20"
                />

              </main>
            </div>
          </div>

          <div className={cn(sheetStickyBottomClassName, "flex justify-end px-4 pt-3 md:hidden")}>
            <SheetClose asChild>
              <OverlayDismissButton label={m.common.close} variant="inline" />
            </SheetClose>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

