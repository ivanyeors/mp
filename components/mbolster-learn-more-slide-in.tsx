"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type Option = { value: string; label: string };
type Media = { src: string; alt: string };

const SIZE_OPTIONS: Option[] = [
  { value: "size-s", label: "Size S (D15 × 0.8m)" },
  { value: "size-m", label: "Size M (D20 × 1.0m)" },
  { value: "size-l", label: "Size L (D20 × 1.2m)" },
];

const CASE_TYPE_OPTIONS: Option[] = [
  { value: "camel", label: "Bolster + Inner Protector + Camel Case" },
  { value: "light-green", label: "Bolster + Inner Protector + Light Green Case" },
  { value: "light-blue", label: "Bolster + Inner Protector + Light Blue Case" },
];

// Images mapped from mpillow.com `/products/bolsters`, using local assets from `/public`.
// Source: `https://www.mpillow.com/products/bolsters`
const MBOLSTER_GALLERY: Media[] = [
  { src: "/MpillowIGPostMay2025.zip-2.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/MpillowIGPostMay2025.zip-5.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/Mpillow_IG_Post_May_2025.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/IMG_5097.jpg", alt: "Customised Bolsters - Mbolster (gallery)" },
  { src: "/IMG_5110.webp", alt: "Customised Bolsters - Mbolster (gallery)" },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xl font-semibold tracking-tight">{children}</h2>;
}

export function MbolsterLearnMoreSlideIn({ className, triggerLabel = "Learn more" }: Props) {
  const [progress, setProgress] = React.useState(0);
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<string>(SIZE_OPTIONS[0]?.value ?? "size-m");
  const [caseType, setCaseType] = React.useState<string>(CASE_TYPE_OPTIONS[0]?.value ?? "camel");
  const [galleryIdx, setGalleryIdx] = React.useState(0);

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
        mobilePreset="full"
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
              <main className="min-w-0">
                {/* Hero (matches product page top content) */}
                <section className="py-10 md:py-16">
                  <div className="space-y-6">
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/808907f4-ac2b-499a-ace6-69933883b2f5.webp"
                        alt="Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                        priority={false}
                      />
                    </AspectRatio>

                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Adjustable Bolster</p>
                      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                        Customised Bolsters - Mbolster
                      </h2>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Not sure how to customise your bolster? Make an appointment with us and we can help you adjust your
                        Mbolster according to your side sleeping preference.
                      </p>
                    </header>

                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">Zoom picture</div>

                      <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-xl border bg-card">
                        <Image
                          src={MBOLSTER_GALLERY[galleryIdx]?.src ?? "/MpillowIGPostMay2025.zip-2.webp"}
                          alt={MBOLSTER_GALLERY[galleryIdx]?.alt ?? "Customised Bolsters - Mbolster"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 640px"
                        />
                      </AspectRatio>

                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {MBOLSTER_GALLERY.map((m, idx) => (
                          <button
                            key={m.src}
                            type="button"
                            onClick={() => setGalleryIdx(idx)}
                            className={cn(
                              "focus-visible:ring-ring focus-visible:ring-offset-background relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/20 ring-offset-2 focus-visible:ring-2 focus-visible:outline-hidden",
                              idx === galleryIdx ? "border-foreground/40" : "border-border",
                            )}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <Image src={m.src} alt={m.alt} fill className="object-cover" sizes="64px" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm">
                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Sale price</div>
                          <div className="text-3xl font-bold tabular-nums">$135.00 SGD</div>
                          <div className="mt-1 text-sm text-muted-foreground">1 review</div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link
                              href="https://www.mpillow.com/products/bolsters"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Add to cart
                            </Link>
                          </Button>
                          <Button asChild variant="secondary">
                            <Link href="/mbolster-config">Customise</Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link
                              href="https://www.mpillow.com/pages/contact"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Book an appointment
                            </Link>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">Size</div>
                          <Select value={size} onValueChange={setSize}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select size" />
                            </SelectTrigger>
                            <SelectContent align="start">
                              {SIZE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">Case Type</div>
                          <Select value={caseType} onValueChange={setCaseType}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select case type" />
                            </SelectTrigger>
                            <SelectContent align="start">
                              {CASE_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="mt-4 text-sm text-muted-foreground leading-relaxed">
                        If you prefer to customise the firmness of your Mbolster by yourself, you can purchase directly{" "}
                        <Link
                          className="underline underline-offset-4"
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          here
                        </Link>
                        .
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">View details</p>
                      <SectionTitle>About Mbolster</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Using the same modular structure as the Mpillow, the firmness of our customisable bolster, Mbolster
                        is adjustable and suitable for side sleeping. Our Mbolster is also hygienic as it is 100% washable.
                        It comes in different sizes to suit your height. You may also add on our Mbolster case made of
                        tencel material to give it a premium feel.
                      </p>
                    </header>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        Duo face cover combines 2 Mbolsters to help stomach sleepers breath better when sleeping on the
                        stomach and to help align the spine.
                      </p>
                      <p>The inner case is made of white polyester fiber.</p>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Choose your size (by height)</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Our Mbolster comes in 3 different height measurements. No matter your height, there is a Mbolster
                        for everyone, even for kids!
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/bolster_mbolster_size.webp"
                        alt="Mbolster size guide"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>
                        <span className="font-medium text-foreground">Size S</span>: Ideal for children or people 1.50m and
                        below
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Size M</span>: Ideal for people 1.50m to 1.80m
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Size L</span>: Ideal for people above 1.80m
                      </li>
                    </ul>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>What’s in the packaging</SectionTitle>
                    </header>

                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li>X1 Mbolster inner case*</li>
                      <li>X1 Vacuum Bag</li>
                      <li>X1 Laundry Bag</li>
                    </ul>

                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm font-semibold text-foreground">Fillings Quantity</div>
                      <div className="mt-1 text-sm text-muted-foreground">Fillings provided and based on the selected size.</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        *Bolster case is excluded. It is optional and it is an add-on.
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Customer Reviews</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">Based on 1 review</p>
                    </header>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border bg-card/40 p-4">
                        <div className="text-sm font-semibold text-foreground">Customised Bolster</div>
                        <div className="mt-2 text-sm text-muted-foreground">My daughter loves the bolster!</div>
                        <div className="mt-3 text-xs text-muted-foreground">— Customer review on mpillow.com</div>
                      </div>

                      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                        <div className="font-semibold text-foreground">Rating breakdown</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>5 stars</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>4 stars</span>
                            <span className="tabular-nums">100%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>3 stars</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>2 stars</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>1 star</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5110.webp"
                        alt="Mbolster photo"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>The Modular and Hygienic Bolster</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Our Mbolster is made of the same modular waterproof fillings as our signature Mpillow. The bolster
                        firmness can be adjusted accordingly to your sleeping preferences especially for side sleeping.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/fillings.webp"
                        alt="Modular waterproof fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Customise Your Mbolster With Us</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Not sure where to start? Use the “Customise” flow or book an appointment and we’ll help you adjust
                        your Mbolster to your side sleeping preference.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Mpillow_IG_Post_May_2025.webp"
                        alt="Customise your Mbolster with us"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link href="/mbolster-config">Customise</Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href="https://www.mpillow.com/pages/contact" target="_blank" rel="noopener noreferrer">
                          Book an appointment
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Modular Fillings For Adjustable Firmness and Machine Washable</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        With the modular fillings, the firmness of our Mbolster can be easily adjustable to suit your
                        sleeping preferences especially for side sleeping. These fillings can also be removed so it is can
                        washed in the washing machine making the bolster hygienic.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/wash-care.webp"
                        alt="Wash care"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Discover the Mbolster</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Complementing the Mpillow in providing better sleep quality is our Mbolster. While the Mpillow
                        helps prevent neck and shoulder pain, the Mbolster ensures side sleepers maintain the right lower
                        back posture throughout the night to prevent muscle strain and lower back pain.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5097.jpg"
                        alt="Discover the Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        A bolster that&apos;s excessively large or overly firm can be incredibly uncomfortable, akin to
                        embracing a piece of rigid wood. Over time, it may gradually soften. If you inspect the inner
                        fabric, you may notice it&apos;s turned yellow, likely due to the accumulation of dust mites. This
                        is because conventional bolsters, being too bulky, are challenging to clean effectively.
                      </p>
                      <p>
                        The M Bolster revolutionizes the traditional paradigm. Its innovative design ensures you have a
                        hygienic bolster with just the right balance of softness and firmness that remains durable over
                        time, providing you with daily comfort.
                      </p>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Bolster_Fillings_gif.webp"
                        alt="Bolster fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Discover on mpillow.com
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

              </main>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MbolsterLearnMoreSheet({ open, onOpenChange }: ControlledSheetProps) {
  const [progress, setProgress] = React.useState(0);
  const [viewportEl, setViewportEl] = React.useState<HTMLDivElement | null>(null);
  const [size, setSize] = React.useState<string>(SIZE_OPTIONS[0]?.value ?? "size-m");
  const [caseType, setCaseType] = React.useState<string>(CASE_TYPE_OPTIONS[0]?.value ?? "camel");
  const [galleryIdx, setGalleryIdx] = React.useState(0);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        mobilePreset="full"
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
              <main className="min-w-0">
                {/* Hero (matches product page top content) */}
                <section className="py-10 md:py-16">
                  <div className="space-y-6">
                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/808907f4-ac2b-499a-ace6-69933883b2f5.webp"
                        alt="Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                        priority={false}
                      />
                    </AspectRatio>

                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">Adjustable Bolster</p>
                      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">
                        Customised Bolsters - Mbolster
                      </h2>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Not sure how to customise your bolster? Make an appointment with us and we can help you adjust your
                        Mbolster according to your side sleeping preference.
                      </p>
                    </header>

                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">Zoom picture</div>

                      <AspectRatio ratio={4 / 3} className="overflow-hidden rounded-xl border bg-card">
                        <Image
                          src={MBOLSTER_GALLERY[galleryIdx]?.src ?? "/MpillowIGPostMay2025.zip-2.webp"}
                          alt={MBOLSTER_GALLERY[galleryIdx]?.alt ?? "Customised Bolsters - Mbolster"}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 640px"
                        />
                      </AspectRatio>

                      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                        {MBOLSTER_GALLERY.map((m, idx) => (
                          <button
                            key={m.src}
                            type="button"
                            onClick={() => setGalleryIdx(idx)}
                            className={cn(
                              "focus-visible:ring-ring focus-visible:ring-offset-background relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/20 ring-offset-2 focus-visible:ring-2 focus-visible:outline-hidden",
                              idx === galleryIdx ? "border-foreground/40" : "border-border",
                            )}
                            aria-label={`View image ${idx + 1}`}
                          >
                            <Image src={m.src} alt={m.alt} fill className="object-cover" sizes="64px" />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-card/40 p-5 backdrop-blur-sm">
                      <div className="flex flex-wrap items-end justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground">Sale price</div>
                          <div className="text-3xl font-bold tabular-nums">$135.00 SGD</div>
                          <div className="mt-1 text-sm text-muted-foreground">1 review</div>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <Button asChild>
                            <Link
                              href="https://www.mpillow.com/products/bolsters"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Add to cart
                            </Link>
                          </Button>
                          <Button asChild variant="secondary">
                            <Link href="/mbolster-config">Customise</Link>
                          </Button>
                          <Button asChild variant="outline">
                            <Link
                              href="https://www.mpillow.com/pages/contact"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Book an appointment
                            </Link>
                          </Button>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">Size</div>
                          <Select value={size} onValueChange={setSize}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select size" />
                            </SelectTrigger>
                            <SelectContent align="start">
                              {SIZE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="text-sm font-medium text-foreground">Case Type</div>
                          <Select value={caseType} onValueChange={setCaseType}>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select case type" />
                            </SelectTrigger>
                            <SelectContent align="start">
                              {CASE_TYPE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="mt-4 text-sm text-muted-foreground leading-relaxed">
                        If you prefer to customise the firmness of your Mbolster by yourself, you can purchase directly{" "}
                        <Link
                          className="underline underline-offset-4"
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          here
                        </Link>
                        .
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <p className="text-sm font-medium text-muted-foreground">View details</p>
                      <SectionTitle>About Mbolster</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Using the same modular structure as the Mpillow, the firmness of our customisable bolster, Mbolster
                        is adjustable and suitable for side sleeping. Our Mbolster is also hygienic as it is 100% washable.
                        It comes in different sizes to suit your height. You may also add on our Mbolster case made of
                        tencel material to give it a premium feel.
                      </p>
                    </header>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        Duo face cover combines 2 Mbolsters to help stomach sleepers breath better when sleeping on the
                        stomach and to help align the spine.
                      </p>
                      <p>The inner case is made of white polyester fiber.</p>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Choose your size (by height)</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Our Mbolster comes in 3 different height measurements. No matter your height, there is a Mbolster
                        for everyone, even for kids!
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/bolster_mbolster_size.webp"
                        alt="Mbolster size guide"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>
                        <span className="font-medium text-foreground">Size S</span>: Ideal for children or people 1.50m and
                        below
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Size M</span>: Ideal for people 1.50m to 1.80m
                      </li>
                      <li>
                        <span className="font-medium text-foreground">Size L</span>: Ideal for people above 1.80m
                      </li>
                    </ul>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>What’s in the packaging</SectionTitle>
                    </header>

                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li>X1 Mbolster inner case*</li>
                      <li>X1 Vacuum Bag</li>
                      <li>X1 Laundry Bag</li>
                    </ul>

                    <div className="rounded-xl border bg-muted/20 p-4">
                      <div className="text-sm font-semibold text-foreground">Fillings Quantity</div>
                      <div className="mt-1 text-sm text-muted-foreground">Fillings provided and based on the selected size.</div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        *Bolster case is excluded. It is optional and it is an add-on.
                      </div>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Customer Reviews</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">Based on 1 review</p>
                    </header>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl border bg-card/40 p-4">
                        <div className="text-sm font-semibold text-foreground">Customised Bolster</div>
                        <div className="mt-2 text-sm text-muted-foreground">My daughter loves the bolster!</div>
                        <div className="mt-3 text-xs text-muted-foreground">— Customer review on mpillow.com</div>
                      </div>

                      <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                        <div className="font-semibold text-foreground">Rating breakdown</div>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <span>5 stars</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>4 stars</span>
                            <span className="tabular-nums">100%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>3 stars</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>2 stars</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span>1 star</span>
                            <span className="tabular-nums">0%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5110.webp"
                        alt="Mbolster photo"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>The Modular and Hygienic Bolster</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Our Mbolster is made of the same modular waterproof fillings as our signature Mpillow. The bolster
                        firmness can be adjusted accordingly to your sleeping preferences especially for side sleeping.
                        Our Mbolster is also hygienic as it is 100% washable.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/fillings.webp"
                        alt="Modular waterproof fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Customise Your Mbolster With Us</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Not sure where to start? Use the “Customise” flow or book an appointment and we’ll help you adjust
                        your Mbolster to your side sleeping preference.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Mpillow_IG_Post_May_2025.webp"
                        alt="Customise your Mbolster with us"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link href="/mbolster-config">Customise</Link>
                      </Button>
                      <Button asChild variant="secondary">
                        <Link href="https://www.mpillow.com/pages/contact" target="_blank" rel="noopener noreferrer">
                          Book an appointment
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Modular Fillings For Adjustable Firmness and Machine Washable</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        With the modular fillings, the firmness of our Mbolster can be easily adjustable to suit your
                        sleeping preferences especially for side sleeping. These fillings can also be removed so it is can
                        washed in the washing machine making the bolster hygienic.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/wash-care.webp"
                        alt="Wash care"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>
                  </div>
                </section>

                <section className="border-t py-6 md:py-8 lg:py-10">
                  <div className="space-y-6">
                    <header className="space-y-2">
                      <SectionTitle>Discover the Mbolster</SectionTitle>
                      <p className="text-base text-muted-foreground leading-relaxed">
                        Complementing the Mpillow in providing better sleep quality is our Mbolster. While the Mpillow
                        helps prevent neck and shoulder pain, the Mbolster ensures side sleepers maintain the right lower
                        back posture throughout the night to prevent muscle strain and lower back pain.
                      </p>
                    </header>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/IMG_5097.jpg"
                        alt="Discover the Mbolster"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                      <p>
                        A bolster that&apos;s excessively large or overly firm can be incredibly uncomfortable, akin to
                        embracing a piece of rigid wood. Over time, it may gradually soften. If you inspect the inner
                        fabric, you may notice it&apos;s turned yellow, likely due to the accumulation of dust mites. This
                        is because conventional bolsters, being too bulky, are challenging to clean effectively.
                      </p>
                      <p>
                        The M Bolster revolutionizes the traditional paradigm. Its innovative design ensures you have a
                        hygienic bolster with just the right balance of softness and firmness that remains durable over
                        time, providing you with daily comfort.
                      </p>
                    </div>

                    <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-xl border bg-card">
                      <Image
                        src="/Bolster_Fillings_gif.webp"
                        alt="Bolster fillings"
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 640px"
                      />
                    </AspectRatio>

                    <div className="flex flex-wrap gap-3">
                      <Button asChild>
                        <Link
                          href="https://www.mpillow.com/products/bolsters"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Discover on mpillow.com
                        </Link>
                      </Button>
                    </div>
                  </div>
                </section>
              </main>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

