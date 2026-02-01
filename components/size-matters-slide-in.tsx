"use client";

import * as React from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, Carousel, MeasureTile } from "@/components/ui/apple-cards-carousel";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import DecryptedText from "@/components/DecryptedText";
import SpotlightCard from "@/components/SpotlightCard";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import Aurora from "./Aurora";

type Props = {
  className?: string;
};

export function SizeMattersSlideIn({ className }: Props) {
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
          Learn More
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        disableMobileBottom
        hideClose
        className="w-full max-w-none sm:max-w-none p-0 bg-transparent border-0 shadow-none overflow-hidden"
      >
        <div className="flex h-full flex-col overflow-hidden bg-background">
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <SheetHeader className="relative pr-12">
              <SheetTitle>Why choose Mpillow</SheetTitle>
              <SheetDescription>Size matters — a pillow should fit you, not the other way around.</SheetDescription>

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
            <div className="px-4 pb-4 md:px-6 md:pb-5">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          <div ref={setViewportNode} className="flex-1 overflow-y-auto">
            <div className="relative overflow-hidden px-4 py-5 md:px-6 md:py-6">
              <Aurora
                colorStops={["#105ef9", "#1ffbff", "#00058f"]}
                blend={0.55}
                amplitude={0.8}
                speed={0.6}
              />
              <main className="relative z-10 min-w-0 space-y-8" aria-label="Mpillow sizing and fit">
                <section
                  aria-labelledby="press-quote-heading"
                  className="mx-auto max-w-3xl py-[42px] animate-in fade-in duration-700 space-y-3 text-center"
                >
                  <h2 id="press-quote-heading" className="sr-only">
                    Press quote
                  </h2>
                  <p className="text-lg font-semibold leading-relaxed tracking-tight sm:text-xl md:text-4xl">
                    <DecryptedText
                      text="When you buy a shirt you have to try different sizes to find one that fits you - so why shouldn't it be the same for a pillow?"
                      animateOn="view"
                      sequential
                      speed={20}
                      loop
                      loopDelay={5000}
                    />
                  </p>
                  <footer className="text-sm text-[var(--color-white)]">— The Straits Times</footer>
                </section>

                <section aria-labelledby="size-matters-heading" className="grid gap-6 md:grid-cols-2 md:items-center">
                  <div className="space-y-2">
                    <h2 id="size-matters-heading" className="text-lg font-semibold leading-tight">
                      Size matters
                    </h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      The length of your shoulder determine the height of the pillow. The different sizes and modular
                      components allow for easy adjustments to fit your precise body structure.
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
                        How do we adjust Mpillow accurately for you?
                      </h2>
                    </CardHeader>
                    <CardContent className="px-0 space-y-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        To ensure that you have the right fit from the Mpillow, a few measurements is required for this to
                        happen.
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
                              title="Shoulder length range"
                              description="Helps determine the pillow height so your neck stays aligned."
                            />
                          </SpotlightCard>,
                          <SpotlightCard
                            key="measure-neck-length"
                            className="flex w-[450px] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
                            data-ui="size-matters-measurement-card"
                          >
                            <MeasureTile
                              iconSrc="/neck-length.svg"
                              title="Neck length"
                              description="Dial in support from the shoulder to the neck curve."
                            />
                          </SpotlightCard>,
                          <SpotlightCard
                            key="measure-neck-depth"
                            className="flex w-[450px] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
                            data-ui="size-matters-measurement-card"
                          >
                            <MeasureTile
                              iconSrc="/neck-to-back.svg"
                              title="Neck depth range"
                              description="Fine-tune the contour so the neck isn’t over-extended."
                            />
                          </SpotlightCard>,
                          <SpotlightCard
                            key="measure-head-depth"
                            className="flex w-[450px] flex-col rounded-3xl bg-muted/20 p-6 min-h-[10.5rem] md:w-[36rem] md:min-h-[12rem]"
                            data-ui="size-matters-measurement-card"
                          >
                            <MeasureTile
                              iconSrc="/head-to-back.svg"
                              title="Head depth range"
                              description="Accounts for different head shapes so pressure stays balanced."
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
                            Head shape differences
                          </h2>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            We spent years developing configurations for round or flat heads, curved or straight spines,
                            long or short necks, and thick or flat backs.
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

                <section aria-labelledby="why-unique-heading">
                  <Card className="rounded-none border-0 bg-transparent py-0 shadow-none gap-2">
                    <CardHeader className="px-0">
                      <h2 id="why-unique-heading" className="leading-none font-semibold">
                        Why is Mpillow usable for all but unique for individuals?
                      </h2>
                    </CardHeader>
                    <CardContent className="px-0 space-y-2 text-sm leading-relaxed text-muted-foreground">
                      <p>We are all unique, one way or another.</p>
                      <p>A pillow should fit you, not the other way around.</p>
                    </CardContent>
                  </Card>
                </section>

                <section aria-labelledby="adjust-accurately-heading">
                  <Card className="rounded-none border-0 bg-transparent py-0 shadow-none gap-2">
                    <CardHeader className="px-0">
                      <h2 id="adjust-accurately-heading" className="leading-none font-semibold">
                        How do we adjust Mpillow accurately for you?
                      </h2>
                    </CardHeader>
                    <CardContent className="px-0 space-y-2 text-sm leading-relaxed text-muted-foreground">
                      <p>To ensure that you have the right fit from the Mpillow, a few measurements is required for this to happen.</p>
                      <p>
                        These measurements would be able to reveal the pillow size that you will actually require to have a
                        good sleep posture.
                      </p>
                    </CardContent>
                  </Card>
                </section>

                <section aria-labelledby="sleep-position-heading">
                  <Card className="rounded-none border-0 bg-transparent py-0 shadow-none gap-2">
                    <CardHeader className="px-0">
                      <h2 id="sleep-position-heading" className="leading-none font-semibold">
                        Designed for your preferred sleep position
                      </h2>
                    </CardHeader>
                    <CardContent className="px-0 space-y-2 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        Our pillow design support system covers all aspect, from your shoulders, to the start of the thoracic
                        spine to your to your neck and head shape.
                      </p>
                      <p>
                        Mpillow&apos;s internal design is divided into three parts. Sleeping on the back in the middle, sleeping
                        on the left and right sides at different heights.
                      </p>
                    </CardContent>
                  </Card>
                </section>

                <section aria-labelledby="unique-configurations-heading">
                  <Card className="rounded-none border-0 bg-transparent py-0 shadow-none gap-2">
                    <CardHeader className="px-0">
                      <h2 id="unique-configurations-heading" className="leading-none font-semibold">
                        Unique configurations for every body
                      </h2>
                    </CardHeader>
                    <CardContent className="px-0 space-y-2 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        We spent 2 years developing the product, 4 years to create 50 over unique configurations for users
                        with round or flat heads, curved or straight spines, long or short necks, and thick or flat backs.
                      </p>
                      <p>These different configurations support ideal sleeping posture for unrestricted airways.</p>
                    </CardContent>
                  </Card>
                </section>

                <section aria-labelledby="engineered-perfection-heading">
                  <Card className="rounded-none border-0 bg-transparent py-0 shadow-none gap-3">
                    <CardHeader className="px-0">
                      <h2 id="engineered-perfection-heading" className="leading-none font-semibold">
                        Engineered to Perfection
                      </h2>
                    </CardHeader>
                    <CardContent className="px-0 space-y-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        We have 3 tiers of customisation, understand which tier would suit your needs before you proceed with
                        your measurements.
                      </p>
                      <div className="flex items-center gap-3 rounded-xl bg-muted/20 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/L-plus.svg" alt="" className="h-8 w-8 shrink-0" />
                        <div className="text-sm text-muted-foreground">
                          Modular components let you fine-tune height and support as your needs change.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </section>

                <section aria-labelledby="size-matters-actions-heading">
                  <h2 id="size-matters-actions-heading" className="sr-only">
                    Next steps
                  </h2>
                  <nav aria-label="Size matters actions" className="grid gap-3 sm:grid-cols-3">
                    <Button asChild className="h-auto py-4">
                      <Link href="https://www.mpillow.com/pages/pillow-selection" target="_blank" rel="noopener noreferrer">
                        Choose Mpillow
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-auto py-4">
                      <Link href="/mbolster-config">
                        Customise mbolster
                      </Link>
                    </Button>
                    <Button asChild variant="secondary" className="h-auto py-4">
                      <Link
                        href="https://www.mpillow.com/collections/accessories"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Get accessories
                      </Link>
                    </Button>
                  </nav>
                </section>
              </main>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

