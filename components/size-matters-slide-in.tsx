"use client";

import * as React from "react";
import Link from "next/link";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

type Props = {
  className?: string;
};

type MeasureTileProps = {
  iconSrc: string;
  title: string;
  description: string;
};

function MeasureTile({ iconSrc, title, description }: MeasureTileProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card/40 p-4 backdrop-blur-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={iconSrc} alt="" className="mt-0.5 h-8 w-8 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm font-semibold leading-tight">{title}</div>
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</div>
      </div>
    </div>
  );
}

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
        className="w-full max-w-none sm:max-w-none p-3 md:p-6 bg-transparent border-0 shadow-none overflow-hidden"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
          <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
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
            <div className="px-4 pb-4 md:px-8 md:pb-5">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          <div ref={setViewportNode} className="flex-1 overflow-y-auto">
            <div className="px-4 py-5 md:px-8 md:py-8">
              <div className="grid gap-8 md:grid-cols-[1fr_320px]">
                <main className="min-w-0 space-y-6">
                  <div className="grid gap-6 md:grid-cols-2 md:items-center">
                    <div className="space-y-2">
                      <div className="text-lg font-semibold leading-tight">Size matters</div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        The length of your shoulder determine the height of the pillow. The different sizes and modular
                        components allow for easy adjustments to fit your precise body structure.
                      </p>
                    </div>
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/m-pillow-417953-web.webp"
                        alt="Mpillow sizing and fit"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </AspectRatio>
                  </div>

                  <blockquote className="rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      When you buy a shirt you have to try different sizes to find one that fits you - so why shouldn&apos;t
                      it be the same for a pillow?
                    </p>
                    <footer className="mt-3 text-xs text-muted-foreground">— The Straits Times</footer>
                  </blockquote>

                  <Card className="rounded-2xl border bg-card/40 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle>Why is Mpillow usable for all but unique for individuals?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                      <p>We are all unique, one way or another.</p>
                      <p>A pillow should fit you, not the other way around.</p>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border bg-card/40 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle>Measurements that matter</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <MeasureTile
                          iconSrc="/shoulder-length.svg"
                          title="Shoulder length range"
                          description="Helps determine the pillow height so your neck stays aligned."
                        />
                        <MeasureTile
                          iconSrc="/neck-length.svg"
                          title="Neck length"
                          description="Dial in support from the shoulder to the neck curve."
                        />
                        <MeasureTile
                          iconSrc="/neck-to-back.svg"
                          title="Neck depth range"
                          description="Fine-tune the contour so the neck isn’t over-extended."
                        />
                        <MeasureTile
                          iconSrc="/head-to-back.svg"
                          title="Head depth range"
                          description="Accounts for different head shapes so pressure stays balanced."
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 md:items-center">
                        <div className="space-y-2">
                          <div className="text-sm font-semibold">Head shape differences</div>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            We spent years developing configurations for round or flat heads, curved or straight spines,
                            long or short necks, and thick or flat backs.
                          </p>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/Head-Shapes-GIF.gif"
                          alt="Head shapes and support examples"
                          className="w-full h-auto rounded-2xl border bg-muted/30"
                          loading="lazy"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border bg-card/40 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle>How do we adjust Mpillow accurately for you?</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                      <p>To ensure that you have the right fit from the Mpillow, a few measurements is required for this to happen.</p>
                      <p>
                        These measurements would be able to reveal the pillow size that you will actually require to have a
                        good sleep posture.
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border bg-card/40 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle>Designed for your preferred sleep position</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
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

                  <Card className="rounded-2xl border bg-card/40 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle>Unique configurations for every body</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                      <p>
                        We spent 2 years developing the product, 4 years to create 50 over unique configurations for users
                        with round or flat heads, curved or straight spines, long or short necks, and thick or flat backs.
                      </p>
                      <p>These different configurations support ideal sleeping posture for unrestricted airways.</p>
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl border bg-card/40 backdrop-blur-sm">
                    <CardHeader>
                      <CardTitle>Engineered to Perfection</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        We have 3 tiers of customisation, understand which tier would suit your needs before you proceed with
                        your measurements.
                      </p>
                      <div className="flex items-center gap-3 rounded-xl border bg-background/60 p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/L-plus.svg" alt="" className="h-8 w-8 shrink-0" />
                        <div className="text-sm text-muted-foreground">
                          Modular components let you fine-tune height and support as your needs change.
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Button asChild className="h-auto py-4">
                      <Link href="https://www.mpillow.com/pages/pillow-selection" target="_blank" rel="noopener noreferrer">
                        Choose Mpillow
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-auto py-4">
                      <Link href="https://www.mpillow.com/pages/mbolster" target="_blank" rel="noopener noreferrer">
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
                  </div>
                </main>

                <aside className="space-y-4 md:pt-1">
                  <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm">
                    <div className="text-sm font-semibold text-foreground">At a glance</div>
                    <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <li>Fits your unique posture and body structure</li>
                      <li>Supports back and side sleeping zones</li>
                      <li>Multiple sizes + modular adjustments</li>
                      <li>Configurations for different head and neck shapes</li>
                    </ul>
                  </div>

                  <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm">
                    <div className="text-sm font-semibold text-foreground">Measurements</div>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border bg-background/60 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/shoulder-length.svg" alt="" className="h-7 w-7" />
                        <div className="mt-2 text-xs text-muted-foreground">Shoulder length</div>
                      </div>
                      <div className="rounded-xl border bg-background/60 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/neck-length.svg" alt="" className="h-7 w-7" />
                        <div className="mt-2 text-xs text-muted-foreground">Neck length</div>
                      </div>
                      <div className="rounded-xl border bg-background/60 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/neck-to-back.svg" alt="" className="h-7 w-7" />
                        <div className="mt-2 text-xs text-muted-foreground">Neck depth</div>
                      </div>
                      <div className="rounded-xl border bg-background/60 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/head-to-back.svg" alt="" className="h-7 w-7" />
                        <div className="mt-2 text-xs text-muted-foreground">Head depth</div>
                      </div>
                    </div>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

