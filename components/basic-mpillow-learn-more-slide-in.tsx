"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { FirmnessScale } from "@/components/firmness-scale";
import { LeftContentRightImgSection } from "@/components/left-content-right-img-section";
import { Carousel } from "@/components/ui/apple-cards-carousel";
import { openBookAppointmentSheet } from "@/components/book-appointment-sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";

type Props = {
  className?: string;
  triggerLabel?: string;
};

type ControlledSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
            <div className="space-y-10 pb-28">
              <LeftContentRightImgSection
                title="Sleep made easy"
                description={
                  <>
                    <p>
                      The Basic Mpillow is an ergonomic pillow for people who have occasional neck and back pain. Our
                      Basic Mpillows for neck support are engineered to provide the optimal balance of comfort and
                      alignment.
                    </p>
                    <p>
                      It gives you the right height for proper head and neck support, whether you sleep on your back or
                      side.
                    </p>

                    <div className="space-y-2 pt-2">
                      <div className="text-sm font-semibold text-foreground">What&apos;s in the packaging</div>
                      <ul className="space-y-1.5">
                        <li>x1 Pillow Cover (Cotton)</li>
                        <li>x1 Pillow Case (Linen)</li>
                        <li>x1 Vacuum Bag</li>
                        <li>x1 Laundry Bag</li>
                        <li>Fillings are provided.</li>
                      </ul>
                    </div>
                  </>
                }
                cta={
                  <Button asChild className="h-auto py-3">
                    <Link href="/mp-config">Customise</Link>
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
                    <SectionTitle>Firmness Level</SectionTitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      The Basic Mpillow is softer than the Premium pillow due to its configuration and internal design.
                    </p>
                  </div>

                  <div className="w-full space-y-3">
                    <FirmnessScale mode="range" value={[25, 35]} title="Basic Mpillow" label="25–35%" className="w-full" />
                    <FirmnessScale mode="range" value={[40, 85]} title="Premium Mpillow" label="40–85%" className="w-full" />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <Carousel
                  itemsContainerClassName="w-full px-0 mx-0 max-w-none"
                  items={[
                    <AppleCarouselInfoCard
                      key="basic-hero"
                      title="Ergonomic support, made simple"
                      description="A supportive shape designed to help relieve neck tension and keep you comfortable."
                      imageSrc="/basic-mpillow.webp"
                      imageAlt="Basic Mpillow ergonomic support"
                    />,
                    <AppleCarouselInfoCard
                      key="patented-m"
                      title="Patented M design supports back and side sleepers"
                      description="Designed to support both back sleepers and side sleepers in one pillow."
                      imageSrc="/Square_3waysleep.webp"
                      imageAlt="Patented M design"
                    />,
                    <AppleCarouselInfoCard
                      key="modular"
                      title="Modular components for easy replacement and maintenance"
                      description="Modular parts make maintenance and replacement simpler over time."
                      imageSrc="/001.webp"
                      imageAlt="Modular components"
                    />,
                    <AppleCarouselInfoCard
                      key="washable"
                      title="Fully washable and easy to clean"
                      description="Easy care so you can keep your setup fresh and comfortable."
                      imageSrc="/wash-care.webp"
                      imageAlt="Wash care"
                    />,
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
                title="Size does matter"
                titleAs="h3"
                titleClassName="text-lg font-semibold tracking-tight md:text-xl"
                description={
                  <>
                    <p>
                      Every body structure is different. The Mpillow&apos;s height conforms to your shoulder length to
                      provide adequate neck support. This determines your pillow size.
                    </p>

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
                <SectionTitle>Sizing Chart</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Refer to the guide below on how to measure your shoulder length. If your measurements are
                  in-between the options, please round them up (e.g. 16.4&quot; → select 17&quot;–18&quot;).
                </p>

                <div className="overflow-hidden rounded-xl border bg-card">
                  <div className="relative aspect-video bg-muted/20">
                    <iframe
                      title="How to measure your shoulder length"
                      className="absolute inset-0 h-full w-full"
                      src="https://www.youtube-nocookie.com/embed/r9XfezALQhA?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&fs=0&iv_load_policy=3&disablekb=1&playsinline=1"
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                </div>
              </section>

              <LeftContentRightImgSection
                className="space-y-3"
                gridClassName="md:items-start"
                headerClassName="space-y-2"
                title="Mpillow Aftercare Video"
                titleAs="h3"
                titleClassName="text-lg font-semibold tracking-tight md:text-xl"
                description={
                  <>
                    <p>How to wash and clean your Basic Mpillow.</p>
                    <p>Want to learn more about doing Mpillow Maintenance?</p>
                  </>
                }
                cta={
                  <Button asChild variant="secondary" className="h-auto py-2.5">
                    <Link href="/mp-care">
                      Mpillow Care
                    </Link>
                  </Button>
                }
                right={
                  <div className="overflow-hidden rounded-xl border bg-card">
                    <div className="relative aspect-video bg-muted/20">
                      <iframe
                        title="Mpillow aftercare video (Basic)"
                        className="absolute inset-0 h-full w-full"
                        src="https://www.youtube-nocookie.com/embed/dsuB9ndOixY?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&fs=0&iv_load_policy=3&disablekb=1&playsinline=1"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="strict-origin-when-cross-origin"
                        allowFullScreen
                      />
                    </div>
                  </div>
                }
              />

            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="px-4 py-4 md:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild className="h-auto py-4">
                <Link href="/mp-config">Customise</Link>
              </Button>
              <Button asChild variant="outline" className="h-auto py-4">
                <button type="button" onClick={openBookAppointmentSheet}>
                  Book Basic Mpillow Adjustment
                </button>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}

export function BasicMpillowLearnMoreSheet({ open, onOpenChange }: ControlledSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <BasicMpillowLearnMoreSheetInner />
    </Sheet>
  );
}

export function BasicMpillowLearnMoreSlideIn({ className, triggerLabel = "Learn more" }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-auto py-2.5", className)}>
          {triggerLabel}
        </Button>
      </SheetTrigger>

      <BasicMpillowLearnMoreSheetInner />
    </Sheet>
  );
}

