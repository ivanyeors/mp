"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { LeftContentRightImgSection } from "@/components/sections/left-content-right-img-section";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ChevronUp, XIcon } from "lucide-react";
import TextType from "@/components/effects/TextType";
import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import { useI18n } from "@/lib/i18n/use-i18n";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Props = {
  className?: string;
};

export function AmbassadorsSlideIn({ className }: Props) {
  const { m } = useI18n();
  const [awardsOpen, setAwardsOpen] = React.useState(true);
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
          {m.slides.ambassadors.trigger}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        disableMobileBottom
        hideClose
        className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
      >
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
            <SheetHeader className="relative pr-12">
              <SheetTitle>{m.slides.ambassadors.title}</SheetTitle>
              <SheetDescription>{m.slides.ambassadors.description}</SheetDescription>

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

            <div className="px-4 pb-4 md:px-6 md:pb-5 space-y-3">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-4 md:p-6">
              <main className="space-y-8" aria-label="Mpillow ambassadors">
                <LeftContentRightImgSection
                  sectionProps={{ "aria-labelledby": "ambassadors-hero-heading", className: "px-0 md:px-0" }}
                  titleAs="h2"
                  title={m.slides.ambassadors.title}
                  titleProps={{ id: "ambassadors-hero-heading" }}
                  titleClassName="text-lg font-semibold leading-tight md:text-xl"
                  description={
                    <>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {m.slides.ambassadors.heroLabel}
                      </p>
                      <p>{m.slides.ambassadors.heroDescription}</p>
                    </>
                  }
                  image={{
                    src: "https://www.mpillow.com/cdn/shop/files/4D59392A-66B4-48D5-BF29-AE4A7B2BD8FF.jpg?v=1676707876&width=1080",
                    alt: "Mpillow ambassadors posture and fit",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                  }}
                  imageWrapperClassName="border-0 bg-muted/20"
                />

                <LeftContentRightImgSection
                  sectionProps={{ "aria-labelledby": "ambassadors-all-builds-heading", className: "px-0 md:px-0" }}
                  titleAs="h2"
                  title={m.slides.ambassadors.allBuildsTitle}
                  titleProps={{ id: "ambassadors-all-builds-heading" }}
                  titleClassName="text-base font-semibold tracking-normal md:text-base"
                  description={
                    <>
                      {m.slides.ambassadors.allBuildsParagraphs.map((text, idx) => (
                        <p key={idx}>{text}</p>
                      ))}
                    </>
                  }
                  image={{
                    src: "https://www.mpillow.com/cdn/shop/files/mpillow_4.png?v=1670166435&width=1080",
                    alt: "Mpillow suited to different builds",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                  }}
                  imageWrapperClassName="border-0 bg-muted/20"
                />

                <LeftContentRightImgSection
                  sectionProps={{ "aria-labelledby": "ambassadors-skyjin-piggie-heading", className: "px-0 md:px-0" }}
                  titleAs="h2"
                  title={m.slides.ambassadors.ambassadorsTitle}
                  titleProps={{ id: "ambassadors-skyjin-piggie-heading" }}
                  titleClassName="text-base font-semibold tracking-normal md:text-base"
                  description={
                    <div className="space-y-4">
                      <div>
                        <div className="text-sm font-semibold text-foreground">{m.slides.ambassadors.awardsIntro}</div>
                        <Collapsible open={awardsOpen} onOpenChange={setAwardsOpen}>
                          <CollapsibleTrigger asChild>
                            <Button variant="outline" className="mt-2 w-full justify-between">
                              {m.slides.ambassadors.awardsButton}
                              {awardsOpen ? (
                                <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
                              ) : (
                                <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                              )}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-3">
                            <ul className="space-y-2 text-sm text-muted-foreground">
                              {m.slides.ambassadors.awards.map((text) => (
                                <li key={text}>{text}</li>
                              ))}
                            </ul>
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </div>
                  }
                  image={{
                    src: "https://www.mpillow.com/cdn/shop/files/Screenshot_2022-12-04_at_11.27.10_PM.png?v=1670167661&width=2864",
                    alt: "Skyjin and Piggie with customised Mpillows",
                    sizes: "(min-width: 768px) 50vw, 100vw",
                  }}
                  imageWrapperClassName="border-0 bg-muted/20"
                />

                <section aria-labelledby="skyjin-testimonial-heading" className="px-0 md:px-0 space-y-2">
                  <h2 id="skyjin-testimonial-heading" className="text-sm font-semibold text-foreground">
                    {m.slides.ambassadors.testimonialTitle}
                  </h2>
                  <section aria-labelledby="skyjin-testimonial-quote" className="space-y-2 pt-3">
                    <h2 id="skyjin-testimonial-quote" className="sr-only">
                      {m.slides.ambassadors.testimonialTitle}
                    </h2>
                    <TextType
                      as="h2"
                      className="text-sm leading-relaxed font-normal text-[var(--color-white)]"
                      text={m.slides.ambassadors.testimonialQuote}
                      typingSpeed={22}
                      pauseDuration={1500}
                      deletingSpeed={18}
                      loop={false}
                      showCursor
                      cursorCharacter="_"
                      cursorBlinkDuration={0.5}
                      startOnVisible
                    />
                    <h2 className="text-xs font-extralight text-[var(--color-white)]">
                      {m.slides.ambassadors.testimonialAttribution}
                    </h2>
                  </section>
                </section>

                <LeftContentRightImgSection
                  sectionProps={{ "aria-labelledby": "ambassadors-video-heading", className: "px-0 md:px-0" }}
                  titleAs="h2"
                  title={m.slides.ambassadors.videoTitle}
                  titleProps={{ id: "ambassadors-video-heading" }}
                  titleClassName="text-base font-semibold tracking-normal md:text-base"
                  description={<p>{m.slides.ambassadors.videoDescription}</p>}
                  right={
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-muted/20">
                      <YouTubeAutoplayOnView
                        videoId="z2u69YPvHi4"
                        title={m.slides.ambassadors.videoTitle}
                        controls={1}
                      />
                    </AspectRatio>
                  }
                />
              </main>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

