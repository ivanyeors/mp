"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

type Props = {
  className?: string;
  triggerLabel?: string;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

export function BasicMpillowLearnMoreSlideIn({ className, triggerLabel = "Learn more" }: Props) {
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
        <Button variant="secondary" className={cn("h-auto py-2.5", className)}>
          {triggerLabel}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        disableMobileBottom
        hideClose
        className="w-full max-w-none sm:max-w-none p-0 bg-transparent border-0 shadow-none overflow-hidden"
      >
        <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
          <div className="sticky top-0 z-10 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
            <SheetHeader className="relative pr-12">
              <SheetTitle>Basic Mpillow</SheetTitle>
              <SheetDescription>
                Experience our affordable uniquely shaped pillow for a goodnight&apos;s sleep.
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

            <div className="px-4 pb-4 md:px-6 md:pb-5">
              <Progress value={progress} className="h-1" />
            </div>
          </div>

          <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="p-0">
              <div className="space-y-10">
                <section className="px-4 pt-5 md:px-6">
                  <div className="grid gap-4 md:grid-cols-2 md:items-center">
                    <div className="space-y-2">
                      <div className="text-sm font-semibold text-foreground">Basic Mpillow</div>
                      <div className="text-2xl font-semibold tabular-nums">$170.00 SGD</div>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Experience our affordable uniquely shaped pillow for a goodnight&apos;s sleep. Its ergonomic
                        design helps relieve neck tension. Perfect for both side sleepers and back sleepers in one
                        pillow.
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        For an additional $20, you may book a personalised appointment with us to adjust your basic
                        Mpillow.
                      </p>
                    </div>

                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/m-pillow-3175012-final---H-WEB.webp"
                        alt="Basic Mpillow"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                        priority={false}
                      />
                    </div>
                  </div>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>Sizing Chart</SectionTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Refer to the guide below on how to measure your shoulder length. If your measurements are
                    in-between the options, please round them up (e.g. 16.4&quot; → select 17&quot;–18&quot;).
                  </p>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/shoulderlength.webp"
                        alt="How to measure shoulder length"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/sizecomparison.webp"
                        alt="Basic Mpillow sizing comparison"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr className="text-left">
                          <th className="px-3 py-2.5 font-semibold">Size</th>
                          <th className="px-3 py-2.5 font-semibold">Shoulder length</th>
                        </tr>
                      </thead>
                      <tbody className="[&>tr:not(:last-child)]:border-b">
                        <tr>
                          <td className="px-3 py-2.5 font-medium">XS</td>
                          <td className="px-3 py-2.5 text-muted-foreground">Less than 14&quot;</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium">S</td>
                          <td className="px-3 py-2.5 text-muted-foreground">Between 15&quot; and 16&quot;</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium">M</td>
                          <td className="px-3 py-2.5 text-muted-foreground">Between 17&quot; and 18&quot;</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium">L</td>
                          <td className="px-3 py-2.5 text-muted-foreground">Between 19&quot; and 20&quot;</td>
                        </tr>
                        <tr>
                          <td className="px-3 py-2.5 font-medium">XL</td>
                          <td className="px-3 py-2.5 text-muted-foreground">Between 21&quot; and 22&quot;</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>What&apos;s in the packaging</SectionTitle>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>x1 Pillow Cover (Cotton)</li>
                    <li>x1 Pillow Case (Linen)</li>
                    <li>x1 Vacuum Bag</li>
                    <li>x1 Laundry Bag</li>
                    <li>Fillings are provided.</li>
                  </ul>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/fillings.webp"
                      alt="Fillings provided"
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 70vw, 100vw"
                    />
                  </div>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>Sleep made easy</SectionTitle>
                  <div className="grid gap-4 md:grid-cols-2 md:items-center">
                    <div className="space-y-2">
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        The Basic Mpillow is an ergonomic pillow for people who have occasional neck and back pain. Our
                        Basic Mpillows for neck support are engineered to provide the optimal balance of comfort and
                        alignment, ensuring you wake up feeling refreshed and pain-free.
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        It gives you the right height for proper head and neck support, whether you sleep on your back
                        or side.
                      </p>
                    </div>

                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                      <Image
                        src="/m-pillow-417804-final-WEB.webp"
                        alt="Basic Mpillow ergonomic support"
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="font-semibold text-foreground">Highlights</div>
                    <ul className="space-y-1.5">
                      <li>Patented M design supports back and side sleepers</li>
                      <li>Modular components for easy replacement and maintenance</li>
                      <li>Fully washable and easy to clean</li>
                    </ul>
                  </div>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>Size does matter</SectionTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Every body structure is different. The Mpillow&apos;s height conforms to your shoulder length to
                    provide adequate neck support. This determines your pillow size.
                  </p>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/sizecomparison.webp"
                      alt="Why sizing matters"
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 70vw, 100vw"
                    />
                  </div>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>Perfect for every sleep position</SectionTitle>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>Measure your shoulder length.</p>
                    <p>Choose the right size of your Mpillow from the chart based on your shoulder length.</p>
                    <p>Add it to your cart and check out. Your Basic Mpillow will be delivered to your doorstep.</p>
                  </div>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/3way-side-sleep.jpg"
                      alt="Sleep positions supported by the Mpillow design"
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 70vw, 100vw"
                    />
                  </div>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>Firmness Level</SectionTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    The Basic Mpillow is softer than the Premium pillow due to its configuration and internal design.
                  </p>
                </section>

                <section className="px-4 md:px-6 space-y-3">
                  <SectionTitle>Mpillow Aftercare</SectionTitle>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    How to wash and clean your Basic Mpillow.
                  </p>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                    <Image
                      src="/wash-care.webp"
                      alt="Basic Mpillow aftercare and wash instructions"
                      fill
                      className="object-cover"
                      sizes="(min-width: 768px) 70vw, 100vw"
                    />
                  </div>
                </section>

                <section className="px-4 pb-6 md:px-6 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button asChild className="h-auto py-4">
                      <Link href="/mp-config">Customise</Link>
                    </Button>
                    <Button asChild variant="outline" className="h-auto py-4">
                      <Link href="https://www.mpillow.com/pages/book-online" target="_blank" rel="noopener noreferrer">
                        Book Basic Mpillow Adjustment
                      </Link>
                    </Button>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Content duplicated from{" "}
                    <Link
                      href="https://www.mpillow.com/pages/basic-ergonomic-pillow"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      Mpillow Basic ergonomic pillow page
                    </Link>
                    .
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

