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

type ControlledSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-lg font-semibold tracking-tight">{children}</h3>;
}

function SectionSubtitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-foreground">{children}</div>;
}

function FeatureCard({
  title,
  imageSrc,
  imageAlt,
  children,
}: {
  title: string;
  imageSrc: string;
  imageAlt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="relative aspect-[16/10] bg-muted/20">
        <Image src={imageSrc} alt={imageAlt} fill className="object-cover" sizes="(min-width: 768px) 50vw, 100vw" />
      </div>
      <div className="space-y-1.5 p-4">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

function PremiumLearnMoreSheetInner() {
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
            <SheetTitle>Premium Mpillow</SheetTitle>
            <SheetDescription>Get the support you need at all the right places with a customised pillow.</SheetDescription>

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
                      <SectionSubtitle>Premium Mpillow Is A Customised Pillow</SectionSubtitle>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Get your pillow customised in person by our Mpillow team — we can build it the way you like it.
                        Watch our experts customise your pillow and try it on the spot until you’re satisfied with the
                        fit before taking it home.
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        For overseas customers, submit your measurements online and follow the guide below for an
                        accurate measurement of each section.
                      </p>
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
                    <SectionTitle>For overseas customers</SectionTitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Submit your measurements online. Our step-by-step flow will guide you with each measurement — in
                      the comfort of your own home.
                    </p>
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
                <SectionTitle>Who it’s for</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Our patented M-shaped neck/shoulder pillows are suitable for individuals who have experienced:
                </p>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  <li>neck pain</li>
                  <li>shoulder and cervical spine pain</li>
                  <li>head and cervical spine surgery</li>
                  <li>uneven shoulder height (scoliosis)</li>
                  <li>acid reflux</li>
                  <li>reversed neck</li>
                  <li>sleep apnea</li>
                  <li>numb fingers</li>
                </ul>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Choosing the right neck pain pillow can significantly improve your sleep quality and help alleviate
                  discomfort.
                </p>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>Price range & charges</SectionTitle>
                <div className="overflow-hidden rounded-xl">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30">
                      <tr className="text-left">
                        <th className="px-3 py-2.5 font-semibold">Size</th>
                        <th className="px-3 py-2.5 font-semibold">Price range (SGD)</th>
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
                  <li>Customisation charge for every hour: $50</li>
                  <li>Readjustment charge: $30 within 60 days of purchase</li>
                  <li>Doorstep surcharge: $250 (includes transportation and one hour customisation)</li>
                </ul>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>Features of our Premium neck & shoulder pain pillow</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Our pillow for cervical neck pain is designed to help maintain proper spinal alignment. Tailored
                  support can help you wake up feeling more refreshed.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <FeatureCard
                    title="Customised to your specific shoulder, neck and head measurements"
                    imageSrc="/NeckDepth.webp"
                    imageAlt="Measurement and customisation"
                  >
                    A fitted pillow starts with accurate measurements so the support lands in the right places.
                  </FeatureCard>

                  <FeatureCard
                    title="3 separate compartments maintain shape and allow for easy height adjustment"
                    imageSrc="/3_compartment.webp"
                    imageAlt="Three compartments"
                  >
                    Separate compartments help maintain structure and make fine-tuning the height easier.
                  </FeatureCard>

                  <FeatureCard title="Waterproof protector for improved hygiene" imageSrc="/m-pillow-518057-final-V-WEB.webp" imageAlt="Waterproof inner protector">
                    An inner protector helps keep things clean and extends the usable life of your pillow.
                  </FeatureCard>

                  <FeatureCard title="Fully washable and easy to clean" imageSrc="/wash-care.webp" imageAlt="Wash care">
                    Easy care matters. Wash and refresh your setup when needed without fuss.
                  </FeatureCard>

                  <FeatureCard title="10-year warranty (filling height)" imageSrc="/fillings.webp" imageAlt="Filling warranty">
                    Long-term support: a 10-year warranty on the stuffing (filling height).
                  </FeatureCard>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>Additional accessory</SectionTitle>
                <div className="grid gap-4 md:grid-cols-2 md:items-center">
                  <div className="space-y-2">
                    <SectionSubtitle>Pillow For Cervical Neck Pain</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Add cervical support if you need extra neck support in your sleep setup.
                    </p>
                    <Button asChild variant="outline" className="h-auto py-3">
                      <Link
                        href="https://www.mpillow.com/pages/cervical-support-pillow-customisable-pillow"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Find out more
                      </Link>
                    </Button>
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted/20">
                    <Image src="/mpillow-cervical-neck.webp" alt="Cervical neck support accessory" fill className="object-cover" sizes="(min-width: 768px) 50vw, 100vw" />
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>Watch how we customise Premium Mpillow</SectionTitle>
                <div className="overflow-hidden rounded-xl border bg-card">
                  <div className="relative aspect-video bg-muted/20">
                    <iframe
                      title="Watch how we customise Premium Mpillow"
                      className="absolute inset-0 h-full w-full"
                      src="https://www.youtube-nocookie.com/embed/V2H03lq9IYU"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="text-sm text-muted-foreground">Prefer YouTube?</div>
                    <Button asChild variant="outline" className="h-auto py-2.5">
                      <Link href="https://www.youtube.com/watch?v=V2H03lq9IYU" target="_blank" rel="noopener noreferrer">
                        Open video
                      </Link>
                    </Button>
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>Overseas measurement guide</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Follow the instructions below for an accurate measurement of each section. Take down your measurement
                  in inches.
                </p>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <SectionSubtitle>A. Shoulder Length</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Wear a fitted shirt and measure your shoulder length from the intersection of the garment.
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
                    <SectionSubtitle>B. Neck Depth</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Stand straight against a door frame. Use a ruler to measure the depth from your back to your neck.
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
                    <SectionSubtitle>C. Head Depth</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Stand straight against a door frame. Use a ruler to measure the depth from your back to your head.
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
                    <SectionSubtitle>D. Neck Length</SectionSubtitle>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Use a ruler to measure the length of your neck from your shoulders to the base of your skull.
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
                <SectionTitle>The Premium Mpillow package</SectionTitle>
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
                  <li>1 Mpillow case (Linen blue / Linen Natural / FibreCool)</li>
                  <li>A number of small and large filling cushions (depending on your pillow size)</li>
                  <li>1 waterproof inner protector</li>
                  <li>2 satin cover sheets</li>
                  <li>1 travel vacuum bag</li>
                  <li>1 laundry bag packaging</li>
                </ul>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>Mpillow aftercare video</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">How to wash and clean your Premium Mpillow.</p>
                <div className="overflow-hidden rounded-xl border bg-card">
                  <div className="relative aspect-video bg-muted/20">
                    <iframe
                      title="Mpillow aftercare video"
                      className="absolute inset-0 h-full w-full"
                      src="https://www.youtube-nocookie.com/embed/LxtHJL9s58E"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="text-sm text-muted-foreground">Prefer YouTube?</div>
                    <Button asChild variant="outline" className="h-auto py-2.5">
                      <Link href="https://www.youtube.com/watch?v=LxtHJL9s58E" target="_blank" rel="noopener noreferrer">
                        Open video
                      </Link>
                    </Button>
                  </div>
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-3">
                <SectionTitle>Our commitment</SectionTitle>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground">Complimentary 60-day re-adjustment</div>
                    <p className="leading-relaxed">
                      We offer a one-time complimentary visit within the initial 60 days post-purchase. Beyond this
                      period or for additional adjustments, a re-adjustment fee of $30 applies. Stuffing is provided
                      for free during re-adjustments (excluding other accessories/components).
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground">10-year warranty inclusion</div>
                    <p className="leading-relaxed">
                      All products are backed by a 10-year warranty on stuffing. To avail, schedule an appointment and
                      bring your pillow to our service center for re-adjustment and stuffing replacement (readjustment
                      fees apply).
                    </p>
                  </div>
                </div>
                <div className="relative aspect-[16/9] overflow-hidden rounded-xl bg-muted/20">
                  <Image src="/DSC03705.webp" alt="Premium Mpillow commitment" fill className="object-cover" sizes="(min-width: 768px) 70vw, 100vw" />
                </div>
              </section>

              <section className="px-4 md:px-6 space-y-2">
                <SectionTitle>Need help?</SectionTitle>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Feel free to contact customer support at <span className="font-medium text-foreground">+65 8780 5311</span>.
                </p>
              </section>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="px-4 py-4 md:px-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild className="h-auto py-4">
                <Link href="/mp-config">Customise online</Link>
              </Button>
              <Button asChild variant="outline" className="h-auto py-4">
                <Link href="https://www.mpillow.com/pages/book-online" target="_blank" rel="noopener noreferrer">
                  Book a bespoke service
                </Link>
              </Button>
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Source:{" "}
              <Link
                href="https://www.mpillow.com/pages/premium-customised-pillow"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Mpillow Premium customised pillow page
              </Link>
              .
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  );
}

export function PremiumLearnMoreSheet({ open, onOpenChange }: ControlledSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <PremiumLearnMoreSheetInner />
    </Sheet>
  );
}

export function PremiumLearnMoreDialog({ className, triggerLabel = "Learn more" }: Props) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary" className={cn("h-auto py-2.5", className)}>
          {triggerLabel}
        </Button>
      </SheetTrigger>

      <PremiumLearnMoreSheetInner />
    </Sheet>
  );
}

