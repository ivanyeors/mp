"use client";

/* eslint-disable @next/next/no-img-element */

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronUp, XIcon } from "lucide-react";
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

type InlineImageProps = {
  src: string;
  alt: string;
  className?: string;
};

function InlineImage({ src, alt, className }: InlineImageProps) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={cn(
        "w-full h-auto rounded-xl border bg-muted/30",
        // Prevent extremely tall images from overwhelming the sheet on desktop.
        "max-h-[55svh] object-contain",
        className
      )}
    />
  );
}

export function AmbassadorsSlideIn({ className }: Props) {
  const [awardsOpen, setAwardsOpen] = React.useState(true);
  const [testimonialOpen, setTestimonialOpen] = React.useState(true);
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
          Learn how
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
              <SheetTitle>How You Stand Is How You Sleep</SheetTitle>
              <SheetDescription>
                A behind-the-scenes look at how Mpillow is customised to fit different body builds.
              </SheetDescription>

              <SheetClose asChild>
                <button
                  type="button"
                  className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
                >
                  <XIcon className="size-4" />
                  <span className="sr-only">Close</span>
                </button>
              </SheetClose>
            </SheetHeader>

            <div className="px-4 pb-4 md:px-6 md:pb-5 space-y-3">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-4 md:p-6 space-y-6">
            <Card className="border-0 bg-transparent shadow-none rounded-none py-0">
              <CardContent className="px-0 grid gap-6 md:grid-cols-2 md:items-center">
                <div className="space-y-2">
                  <div className="text-lg font-semibold leading-tight">How You Stand Is How You Sleep</div>
                  <div className="text-sm text-muted-foreground">Ambassadors</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    See how the Mpillow is adjusted to each person’s posture and body build.
                  </p>
                </div>

                <InlineImage
                  src="https://www.mpillow.com/cdn/shop/files/4D59392A-66B4-48D5-BF29-AE4A7B2BD8FF.jpg?v=1676707876&width=1080"
                  alt="Mpillow ambassadors - posture and fit"
                  className="max-h-[45svh]"
                />
              </CardContent>
            </Card>

            <Card className="border-0 bg-transparent shadow-none rounded-none py-0">
              <CardHeader className="px-0">
                <CardTitle>Mpillow Suits All Builds</CardTitle>
              </CardHeader>
              <CardContent className="px-0 grid gap-6 md:grid-cols-2 md:items-center">
                <InlineImage
                  src="https://www.mpillow.com/cdn/shop/files/mpillow_4.png?v=1670166435&width=1080"
                  alt="Mpillow customised fit example"
                  className="max-h-[45svh]"
                />

                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    The bespoke Mpillows were customised for Skyjin and Piggie accordingly so the pillows fit them when
                    they sleep on their side and back. In these photos, the Mpillows are adjusted accordingly to their
                    build and shape to show how you stand is how you sleep.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 bg-transparent shadow-none rounded-none py-0">
              <CardHeader className="px-0">
                <CardTitle>Our Ambassadors: Skyjin &amp; Piggie</CardTitle>
                <CardDescription>Explore the awards and testimonial.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 space-y-4">
                <Collapsible open={awardsOpen} onOpenChange={setAwardsOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      Awards
                      {awardsOpen ? (
                        <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted underline-offset-4">
                              2022 Mr Kedah Bodybuilder Light Heavyweight Champion
                            </span>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Award highlight</TooltipContent>
                        </Tooltip>
                      </li>
                      <li>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help underline decoration-dotted underline-offset-4">
                              2022 Mr Malaysia Bodybuilder Light Heavyweight Top10
                            </span>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={6}>Award highlight</TooltipContent>
                        </Tooltip>
                      </li>
                    </ul>
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={testimonialOpen} onOpenChange={setTestimonialOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      Skyjin&apos;s testimonial
                      {testimonialOpen ? (
                        <ChevronUp className="size-4 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-4 text-muted-foreground" aria-hidden="true" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-3">
                    <blockquote className="rounded-xl border bg-card/40 p-4 text-sm leading-relaxed text-muted-foreground">
                      “For several years, I’ve had trouble sleeping well at night. I tried different types of pillows
                      but nothing worked. Thankfully I discovered the Mpillow. It is the only pillow that can fit my
                      size and build perfectly and give me the right support. For the first time in years, I have been
                      able to get seven to eight hours of deep, quality sleep every night. I am also amazed that the
                      Mpillow successfully resolved my shoulder pain. I had no idea it was caused by ill-fitting pillows!”
                    </blockquote>
                    <div className="mt-2 text-xs text-muted-foreground">
                      — Skyjin, fitness trainer and bodybuilder, 2022 Mr Malaysia Bodybuilder Light Heavyweight Top10
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>

            <Card className="border-0 bg-transparent shadow-none rounded-none py-0 overflow-hidden">
              <CardHeader className="px-0">
                <CardTitle>Watch the process</CardTitle>
                <CardDescription>Behind-the-scenes video</CardDescription>
              </CardHeader>
              <CardContent className="px-0 space-y-4">
                <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border">
                  <iframe
                    className="absolute inset-0 h-full w-full"
                    src="https://www.youtube.com/embed/z2u69YPvHi4"
                    title="Mpillow - Watch the process"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                  />
                </AspectRatio>
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

