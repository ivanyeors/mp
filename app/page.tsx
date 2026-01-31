import { HomeHeader } from "@/components/home-header";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { AmbassadorsSlideIn } from "@/components/ambassadors-slide-in";
import { SizeMattersSlideIn } from "@/components/size-matters-slide-in";
import { BasicMpillowLearnMoreSlideIn } from "@/components/basic-mpillow-learn-more-slide-in";
import { PremiumLearnMoreDialog } from "../components/premium-learn-more-dialog";
import { MbolsterLearnMoreSlideIn } from "@/components/mbolster-learn-more-slide-in";
import { BookAppointmentSheet } from "@/components/book-appointment-sheet";
import { InfiniteImageMarquee } from "@/components/infinite-image-marquee";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import SpotlightCard from "@/components/SpotlightCard";
import MagicBento from "@/components/MagicBento";
import {
  Award,
  BadgeCheck,
  ChevronRight,
  SlidersHorizontal,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/server";
import { StoriesSection } from "@/components/stories-section";

type PillowKind = "basic" | "premium";

function parsePrice(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function formatPriceLabel(value: number | null): string {
  if (value === null) return "—";
  const isInteger = Math.abs(value - Math.round(value)) < 1e-9;
  return `$${isInteger ? Math.round(value) : value.toFixed(2)}`;
}

async function getPillowXsFromPriceLabel(kind: PillowKind): Promise<string> {
  try {
    const admin = supabaseAdmin();
    const { data: pillowProduct, error: pillowError } = await admin
      .from("pillow_products")
      .select("id")
      .eq("is_active", true)
      .eq("kind", kind)
      .eq("size", "XS")
      .maybeSingle();

    if (pillowError || !pillowProduct?.id) return "—";
    const productId = Number(pillowProduct.id);
    if (!Number.isFinite(productId) || productId <= 0) return "—";

    if (kind === "basic") {
      const key = `product:pillow:${productId}`;
      const { data: priceRow, error: priceError } = await admin
        .from("product_prices")
        .select("msrp")
        .eq("key", key)
        .maybeSingle();
      if (priceError) return "—";
      return formatPriceLabel(parsePrice(priceRow?.msrp));
    }

    // Premium: prefer per-variant keys; if both exist, show the lower price as "From".
    const keys = [`product:pillow:${productId}:linen`, `product:pillow:${productId}:fibrecool`, `product:pillow:${productId}`];
    const { data: rows, error: rowsError } = await admin
      .from("product_prices")
      .select("key,msrp")
      .in("key", keys);
    if (rowsError) return "—";

    const prices = (rows ?? [])
      .map((r) => parsePrice((r as { msrp?: unknown }).msrp))
      .filter((v): v is number => v !== null);
    if (prices.length === 0) return "—";
    return formatPriceLabel(Math.min(...prices));
  } catch {
    return "—";
  }
}

async function getBolsterFromPriceLabel(): Promise<string> {
  try {
    const admin = supabaseAdmin();
    const keys = ["product:bolster:short", "product:bolster:medium", "product:bolster:long"];
    const { data: rows, error } = await admin
      .from("product_prices")
      .select("key,msrp")
      .in("key", keys);
    if (error) return "—";

    const prices = (rows ?? [])
      .map((r) => parsePrice((r as { msrp?: unknown }).msrp))
      .filter((v): v is number => v !== null);
    if (prices.length === 0) return "—";
    return formatPriceLabel(Math.min(...prices));
  } catch {
    return "—";
  }
}

export default async function Home() {
  const appointmentUrl =
    "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0bNnrc_0CeREyaoByx0GDhuif5fJFTCyAQTkEJH14vNs5XT_zzqgv47CJ-FrUACncTtYs8yeas?gv=true";
  const [basicXsFromPrice, premiumXsFromPrice, bolsterFromPrice] = await Promise.all([
    getPillowXsFromPriceLabel("basic"),
    getPillowXsFromPriceLabel("premium"),
    getBolsterFromPriceLabel(),
  ]);

  return (
    <div className="min-h-screen bg-background relative">
      <HomeHeader />

      <main className="relative overflow-x-hidden">
        {/* Hero */}
        <section className="relative">
          <AspectRatio ratio={16 / 9} className="relative w-full overflow-hidden">
            <Image
              src="/m-pillow-417953-web.webp"
              alt="Mpillow pillow hero"
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />

            {/* Overlay content */}
            <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-background/85 via-background/25 to-transparent" />
            <div className="absolute inset-0 z-10 flex items-end md:items-center">
              <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
                <div className="max-w-xl space-y-6">
                  <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
                      Gift A Good Night’s Sleep With A{" "}
                      <span className="text-primary">100% Customised</span> Pillow
                    </h1>
                    <p className="text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
                      A cervical neck support pillow to maintain the perfect posture for every sleep position.
                    </p>
                  </div>

                  <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button asChild className="h-auto px-6 py-4 text-base">
                      <Link href="/mp-config">
                        <Sparkles className="mr-2 h-5 w-5" />
                        Customise
                        <ChevronRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                    <BookAppointmentSheet
                      appointmentUrl={appointmentUrl}
                      triggerVariant="outline"
                      triggerClassName="h-auto px-6 py-4 text-base"
                      triggerLabel="Book an appointment"
                    />
                  </div>
                </div>
              </div>
            </div>
          </AspectRatio>

          <Ripple
            mainCircleSize={320}
            mainCircleOpacity={0.12}
            numCircles={6}
            className="absolute inset-0 -z-10"
          />
        </section>

        {/* Size matters / Why choose */}
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Customised pillow from Singapore, handcrafted for a perfect night’s sleep
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Learn why proper sizing and configuration matter for sleep posture — and how Mpillow is adjusted to
                  fit your unique body build.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <SizeMattersSlideIn />
                </div>
              </div>

              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.mpillow.com/cdn/shop/files/m-pillow-317409-final-WEB.jpg?v=1662868268&width=1400"
                  alt="Customised Mpillow"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </AspectRatio>
            </div>
          </div>
        </section>

        {/* Marquee (full-bleed) */}
        <section className="relative py-12 md:py-16">
          <div className="relative left-1/2 w-screen -translate-x-1/2">
            {/* 30% shorter than original (443px -> ~310px): keep full-bleed marquee but reduce height */}
            <AspectRatio ratio={1150 / 310} className="relative overflow-hidden border bg-card/40 backdrop-blur-sm">
              <InfiniteImageMarquee
                src="/3way-side-sleep.jpg"
                alt="Three-way sleep positions illustration"
                imageClassName="object-cover"
              />
            </AspectRatio>
          </div>
        </section>

        {/* Ambassadors / How it’s made */}
        <section id="ambassadors" className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Customisable pillows for any body build
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  For our ambassadors, Skyjin and Piggie — a behind-the-scenes look at the customisation process.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <AmbassadorsSlideIn />
                </div>
              </div>

              <AspectRatio
                ratio={16 / 9}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://www.mpillow.com/cdn/shop/files/DSC_2362-H-WEB_1200x_71b66f9b-3cce-4686-99be-34f774ddbe8a.webp?v=1667646766&width=900"
                  alt="Mpillow ambassadors process"
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </AspectRatio>
            </div>
          </div>
        </section>

        {/* Customers */}
        <section id="stories" className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <StoriesSection />
          </div>
        </section>

        {/* Pick your Mpillow */}
        <section id="pick" className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="space-y-8">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Pick your Mpillow</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We have Mpillow for every body.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {[
                  {
                    title: "Basic",
                    desc: "Basic customisation to try out ",
                    imageSrc: "/basic-mpillow.webp",
                    rightBadge: "Standard Fit",
                    fromPriceLabel: basicXsFromPrice,
                    specs: [
                      { label: "Customisation", level: 1, hint: "" },
                      { label: "Fit control", level: 2, hint: "" },
                    ],
                  },
                  {
                    title: "Premium",
                    desc: "Premium customisation for the best fit",
                    imageSrc: "/DarkMpillowImage-WEB.jpg",
                    rightBadge: "Custom Fit",
                    fromPriceLabel: premiumXsFromPrice,
                    specs: [
                      { label: "Customisation", level: 3, hint: "" },
                      { label: "Fit control", level: 4, hint: "" },
                    ],
                  },
                ].map((card) => (
                  <Card
                    key={card.title}
                    className="overflow-hidden bg-card/40 backdrop-blur-sm py-0 gap-0"
                  >
                    <div className="relative h-[200px]">
                      <Image
                        src={card.imageSrc}
                        alt={`${card.title} Mpillow`}
                        fill
                        className="object-cover"
                        sizes="(min-width: 768px) 50vw, 100vw"
                      />

                      <div className="absolute top-3 left-3 flex gap-1">
                        <Badge>{card.title}</Badge>
                      </div>

                      <Badge
                        variant="outline"
                        className="absolute top-3 right-3 bg-background/90"
                      >
                        {card.rightBadge}
                      </Badge>
                    </div>

                    <CardContent className="p-4">
                      <h3 className="font-semibold">{card.desc}</h3>
                      <div className="mt-4 space-y-2">
                        {card.specs.map((s) => (
                          <div
                            key={s.label}
                            className="flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2 text-sm">
                              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                              <span>{s.label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 4 }).map((_, idx) => (
                                <div
                                  key={idx}
                                  className={[
                                    "h-2 w-4 rounded-sm",
                                    idx < s.level ? "bg-primary" : "bg-muted",
                                  ].join(" ")}
                                />
                              ))}
                              <span className="ml-2 text-xs text-muted-foreground">
                                {s.hint}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-2xl font-bold tabular-nums">
                          From {card.fromPriceLabel}
                        </span>
                      </div>
                    </CardContent>

                    <CardFooter className="p-4 pt-0">
                      {card.title === "Basic" ? (
                        <div className="flex w-full items-center gap-2">
                          <BasicMpillowLearnMoreSlideIn className="flex-1" />
                          <Button asChild className="flex-1">
                            <Link href="/mp-config">Customise</Link>
                          </Button>
                        </div>
                      ) : (
                        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                          <PremiumLearnMoreDialog className="flex-1" />
                          <Button asChild className="flex-1">
                            <Link href="/mp-config">Customise</Link>
                          </Button>
                        </div>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Why choose / Neck pain */}
        <section id="why" className="relative">
          <div
            className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16 md:min-h-[760px]"
            style={{ position: "relative" }}
          >
            {/* Requested DOM placement + pixel position (desktop) */}
            <div
              className="pointer-events-none absolute inset-x-0 top-[287px] hidden h-[444px] w-full overflow-hidden rounded-2xl border bg-card/40 shadow-sm backdrop-blur-sm md:block"
              aria-hidden="true"
            >
              <Image
                src="/mpillow-cervical-neck.webp"
                alt="Mpillow cervical neck support"
                fill
                className="object-cover"
                sizes="(min-width: 1280px) 1120px, (min-width: 768px) calc(100vw - 2rem), 100vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
            </div>

            {/* Match the "Ambassadors" section layout style */}
            <div className="relative z-10 grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">Neck Pains?</h2>
                <p className="text-muted-foreground leading-relaxed">
                  With our premium Mpillow, the ultimate customisable pillow for cervical neck pain relief. Designed to support
                  your unique posture and sleep style, our modular pillows help improve sleep quality, reduce stiffness,
                  and promote spinal alignment.
                </p>
              </div>

              {/* Desktop: avoid empty right column (keeps alignment clean) */}
              <div className="hidden md:block">
                <div className="rounded-2xl border bg-card/40 p-6 shadow-sm backdrop-blur-sm">
                  <div className="text-sm font-semibold tracking-tight">What you’ll feel</div>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                      <p>
                        <span className="font-medium text-foreground">More supported</span> neck and head posture.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <SlidersHorizontal className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                      <p>
                        <span className="font-medium text-foreground">Better fit</span> for your height and sleep style.
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                      <p>
                        <span className="font-medium text-foreground">Easier upkeep</span> with washable components.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile: keep image in-flow like Ambassadors */}
              <AspectRatio
                ratio={1048 / 444}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm md:hidden"
              >
                <Image
                  src="/mpillow-cervical-neck.webp"
                  alt="Mpillow cervical neck support"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 1048px"
                />
              </AspectRatio>
            </div>

          </div>
        </section>

        {/* Why choose (highlights) */}
        <section className="relative pt-10 md:pt-12">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:pb-16">
            <MagicBento
              className="card-grid--asymmetric rounded-2xl bg-card/40 p-2 shadow-sm backdrop-blur-sm"
              cards={[
                {
                  key: "why-01",
                  color: "var(--card)",
                  label: "01",
                  title: "Adjustable height",
                  description: "Easily adjustable for any height",
                },
                {
                  key: "why-02",
                  color: "var(--card)",
                  label: "02",
                  title: "100% washable",
                  description: "Covers and components are easy to keep fresh",
                },
                {
                  key: "why-03",
                  color: "var(--card)",
                  label: "03",
                  title: "Designed for your sleep style",
                  description: "Uniquely shaped to suit your sleeping position",
                },
                {
                  key: "why-04",
                  color: "var(--card)",
                  label: "04",
                  title: "Customisable width",
                  description: "Built for different body builds and shoulder widths",
                },
                {
                  key: "why-05",
                  color: "var(--card)",
                  label: "05",
                  title: "Modular & serviceable",
                  description: "Modular components for easy maintenance",
                },
              ]}
              textAutoHide={false}
              enableTilt={false}
              enableSpotlight
              enableBorderGlow
              enableStars
              enableMagnetism
              clickEffect
              particleCount={10}
              spotlightRadius={260}
            />
          </div>
        </section>

        {/* Mbolster highlight */}
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:pb-16">
            <Card className="overflow-hidden bg-card/40 backdrop-blur-sm py-0 gap-0">
              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="relative aspect-[1493/554] w-full md:aspect-auto md:min-h-[360px]">
                  <Image
                    src="/808907f4-ac2b-499a-ace6-69933883b2f5.webp"
                    alt="Mbolster"
                    fill
                    className="object-cover"
                    sizes="(min-width: 1280px) 560px, (min-width: 768px) 50vw, 100vw"
                  />
                </div>

                <div className="flex flex-col">
                  <CardContent className="p-5 md:p-7">
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Mbolster</h2>
                      <p className="text-muted-foreground leading-relaxed">
                        A customisable bolster designed to fit your body build — dial in your comfort with adjustable
                        support.
                      </p>
                    </div>

                    <div className="mt-4">
                      <h3 className="font-semibold">Premium customisation for the best fit</h3>

                      <div className="mt-4 space-y-2">
                        {[
                          { label: "Customisation", level: 3 },
                          { label: "Fit control", level: 4 },
                        ].map((s) => (
                          <div key={s.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sm">
                              <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                              <span>{s.label}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              {Array.from({ length: 4 }).map((_, idx) => (
                                <div
                                  key={idx}
                                  className={[
                                    "h-2 w-4 rounded-sm",
                                    idx < s.level ? "bg-primary" : "bg-muted",
                                  ].join(" ")}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-2xl font-bold tabular-nums">From {bolsterFromPrice}</span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="p-5 pt-0 md:p-7 md:pt-0">
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                      <MbolsterLearnMoreSlideIn className="flex-1" />
                      <Button asChild className="flex-1">
                        <Link href="/mbolster-config">Customise mbolster</Link>
                      </Button>
                    </div>
                  </CardFooter>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Credibility strip */}
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SpotlightCard className="min-h-[207px] rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <Award className="h-6 w-6 text-primary" />
                <div className="mt-3 text-2xl font-semibold">Singapore Good Design 2022</div>
                <div className="mt-1 text-sm text-muted-foreground">Award-winning brand</div>
              </SpotlightCard>
              <SpotlightCard className="min-h-[207px] rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <div className="mt-3 text-2xl font-semibold">7 years</div>
                <div className="mt-1 text-sm text-muted-foreground">Research and development</div>
              </SpotlightCard>
              <SpotlightCard className="min-h-[207px] rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <BadgeCheck className="h-6 w-6 text-primary" />
                <div className="mt-3 text-2xl font-semibold">Patented</div>
                <div className="mt-1 text-sm text-muted-foreground">Across multiple countries</div>
              </SpotlightCard>
            </div>
          </div>
        </section>

        {/* Review */}
        <section id="review" className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                  Dr Steven Hulme&apos;s Mpillow Review
                </h2>
                <p className="text-muted-foreground">Featured review.</p>
              </div>

              <AspectRatio
                ratio={16 / 9}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
              >
                <iframe
                  className="absolute inset-0 h-full w-full"
                  src="https://www.youtube-nocookie.com/embed/nvFI6woJD9g?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&fs=0&iv_load_policy=3&disablekb=1&playsinline=1"
                  title="YouTube video player"
                  frameBorder={0}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </AspectRatio>

            </div>
          </div>
        </section>

        {/* Founder note */}
        <section className="relative">
          <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
            <div className="rounded-2xl border bg-card/40 p-8 backdrop-blur-sm">
              <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
                <div className="min-w-0">
                  <div className="mb-8">
                    <h2 className="mb-3 text-3xl font-bold tracking-tight">A note from our founder</h2>
                    <p className="text-muted-foreground">Why we built this company</p>
                  </div>

                  <div className="space-y-6">
                    <p className="text-muted-foreground leading-relaxed">
                      What you&apos;re buying isn&apos;t just a product — it&apos;s everything that went into it: the
                      art, the design, the long nights, the hard work, the setbacks, the breakthroughs, the
                      persistence, the dedication, the time, and the love.
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      A truly good product isn&apos;t made by copying what already exists. It&apos;s made by listening
                      closely to real people and building around their needs and pain points. We&apos;ve poured
                      thousands of hours into research and refinement — learning from mistakes, taking feedback to
                      heart, and continuing even when it was difficult. And through it all, we&apos;ve held on to one
                      belief: if we keep showing up with honest intention and help others, God will open the way.
                    </p>

                    <div className="pt-2">
                      <p className="font-semibold">Darren Yeo</p>
                      <p className="text-sm text-muted-foreground">Founder</p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border bg-muted">
                    <Image
                      src="/Darrenyeo-profileshoot_2.webp"
                      alt="Darren Yeo"
                      fill
                      className="object-cover object-top"
                      sizes="(min-width: 768px) 50vw, 100vw"
                      priority={false}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
