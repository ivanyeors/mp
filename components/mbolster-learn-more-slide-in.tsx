"use client";

import * as React from "react";
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

export function MbolsterLearnMoreSlideIn({ className, triggerLabel = "Learn more" }: Props) {
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
        <Button variant="secondary" className={cn("h-9 px-4 py-2", className)}>
          {triggerLabel}
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
              <SheetTitle>Mbolster</SheetTitle>
              <SheetDescription>Adjustable bolster, sized to your height.</SheetDescription>

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

          {/* Content area fills remaining height */}
          <div ref={setViewportNode} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-4 py-5 md:px-8 md:py-8">
              <div className="grid gap-8 md:grid-cols-[1fr_320px]">
                <main className="min-w-0 space-y-10">
                  <section className="space-y-3">
                    <div className="text-sm font-semibold text-muted-foreground">Adjustable Bolster</div>
                    <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Customised Bolsters - Mbolster</h2>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Not sure how to customise your bolster? Make an appointment with us and we can help you adjust your
                      Mbolster according to your side sleeping preference.
                    </p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      <Button asChild>
                        <Link href="/mbolster-config">
                          Customise
                        </Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href="https://www.mpillow.com/pages/contact" target="_blank" rel="noopener noreferrer">
                          Book an appointment
                        </Link>
                      </Button>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <SectionTitle>About Mbolster</SectionTitle>
                    <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        Using the same modular structure as the Mpillow, the firmness of our customisable bolster, Mbolster
                        is adjustable and suitable for side sleeping. Our Mbolster is also hygienic as it is 100% washable.
                        It comes in different sizes to suit your height.
                      </p>
                      <p>
                        Duo face cover combines 2 Mbolsters to help stomach sleepers breathe better when sleeping on the
                        stomach and to help align the spine.
                      </p>
                      <p>The inner case is made of white polyester fiber.</p>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <SectionTitle>Choose your size (by height)</SectionTitle>
                    <div className="overflow-hidden rounded-xl border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr className="text-left">
                            <th className="px-3 py-2.5 font-semibold">Size</th>
                            <th className="px-3 py-2.5 font-semibold">Dimensions</th>
                            <th className="px-3 py-2.5 font-semibold">Ideal for</th>
                          </tr>
                        </thead>
                        <tbody className="[&>tr:not(:last-child)]:border-b">
                          <tr>
                            <td className="px-3 py-2.5 font-medium">S</td>
                            <td className="px-3 py-2.5 text-muted-foreground">D15 × 0.8m</td>
                            <td className="px-3 py-2.5 text-muted-foreground">≤ 1.50m</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2.5 font-medium">M</td>
                            <td className="px-3 py-2.5 text-muted-foreground">D20 × 1.0m</td>
                            <td className="px-3 py-2.5 text-muted-foreground">1.50m–1.80m</td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2.5 font-medium">L</td>
                            <td className="px-3 py-2.5 text-muted-foreground">D20 × 1.2m</td>
                            <td className="px-3 py-2.5 text-muted-foreground">&gt; 1.80m</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="space-y-3">
                    <SectionTitle>What’s in the packaging</SectionTitle>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li>x1 Mbolster inner case*</li>
                      <li>x1 Vacuum Bag</li>
                      <li>x1 Laundry Bag</li>
                    </ul>
                    <div className="text-xs text-muted-foreground">
                      *Bolster case is excluded. It is optional and it is an add-on. Fillings provided and based on the
                      selected size.
                    </div>
                  </section>

                  <div className="text-xs text-muted-foreground">
                    Content duplicated from{" "}
                    <Link
                      href="https://www.mpillow.com/products/bolsters"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-4"
                    >
                      mpillow.com product page
                    </Link>
                    .
                  </div>
                </main>

                <aside className="space-y-3 md:pt-1">
                  <div className="text-sm font-medium text-foreground">At a glance</div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li>Modular fillings for adjustable firmness</li>
                    <li>Machine washable for hygiene</li>
                    <li>Sizes S/M/L by height</li>
                    <li>Helps support side sleepers’ posture</li>
                  </ul>

                  <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                    <div className="font-semibold text-foreground">Customer review</div>
                    <div className="mt-1">“My daughter loves the bolster!”</div>
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

