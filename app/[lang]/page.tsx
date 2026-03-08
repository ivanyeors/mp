import { HomeHeader } from "@/components/ui/home-header";
import { Ripple } from "@/components/ui/shadcn-io/ripple";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { AmbassadorsSlideIn } from "@/components/slide-in-pages/ambassadors-slide-in";
import { SizeMattersSlideIn } from "@/components/slide-in-pages/size-matters-slide-in";
import { BasicMpillowLearnMoreSheet } from "@/components/slide-in-pages/basic-mpillow-learn-more-slide-in";
import { PremiumLearnMoreSheet } from "@/components/slide-in-pages/premium-learn-more-dialog";
import { MbolsterLearnMoreSlideIn } from "@/components/slide-in-pages/mbolster-learn-more-slide-in";
import { BookAppointmentSheet } from "@/components/slide-in-pages/book-appointment-sheet";
import { CervicalNeckSupportLearnMoreCta } from "@/components/slide-in-pages/cervical-neck-support-learn-more-cta";
import { InfiniteImageMarquee } from "@/components/effects/infinite-image-marquee";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import SpotlightCard from "@/components/effects/SpotlightCard";
import MagicBento from "@/components/effects/MagicBento";
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
import { getSiteSettings } from "@/lib/site-settings";
import { StoriesSection } from "@/components/sections/stories-section";
import { YouTubeAutoplayOnView } from "@/components/effects/youtube-autoplay-on-view";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { withLocale } from "@/lib/i18n/routing";

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

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const m = getMessages(locale);
  const sep = locale === "zh-CN" ? "" : " ";

  const appointmentUrl =
    "https://calendar.google.com/calendar/appointments/schedules/AcZssZ0bNnrc_0CeREyaoByx0GDhuif5fJFTCyAQTkEJH14vNs5XT_zzqgv47CJ-FrUACncTtYs8yeas?gv=true";

  // Default images – overridable via Settings → Landing Site → Media
  const IMAGE_DEFAULTS: Record<string, string> = {
    landing_hero: "/m-pillow-417953-web.webp",
    landing_size_matters: "https://www.mpillow.com/cdn/shop/files/m-pillow-317409-final-WEB.jpg?v=1662868268&width=1400",
    landing_marquee: "/3way-side-sleep.jpg",
    landing_ambassadors: "https://www.mpillow.com/cdn/shop/files/DSC_2362-H-WEB_1200x_71b66f9b-3cce-4686-99be-34f774ddbe8a.webp?v=1667646766&width=900",
    landing_cervical_neck: "/mpillow-cervical-neck.webp",
    landing_basic_pillow: "/basic-mpillow.webp",
    landing_premium_pillow: "/DarkMpillowImage-WEB.jpg",
    landing_mbolster: "/808907f4-ac2b-499a-ace6-69933883b2f5.webp",
    landing_founder: "/Darrenyeo-profileshoot_2.webp",
  };

  const [basicXsFromPrice, premiumXsFromPrice, bolsterFromPrice, siteOverrides] = await Promise.all([
    getPillowXsFromPriceLabel("basic"),
    getPillowXsFromPriceLabel("premium"),
    getBolsterFromPriceLabel(),
    getSiteSettings(Object.keys(IMAGE_DEFAULTS)),
  ]);

  // Merge overrides with defaults
  const img: Record<string, string> = { ...IMAGE_DEFAULTS, ...siteOverrides };

  return (
    <div className="min-h-screen bg-background relative">
      <HomeHeader />

      <main className="relative overflow-x-hidden">
        {/* Hero */}
        <section className="relative">
          <div className="relative w-full overflow-hidden aspect-[3/4] md:aspect-video">
            <Image
              src={img.landing_hero}
              alt="Mpillow pillow hero"
              fill
              priority
              className="object-cover"
              sizes="100vw"
            />

            {/* Overlay content */}
            <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-background/85 via-background/25 to-transparent" />
            {/* Extra light-mode-only overlay on mobile for better text contrast */}
            <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-black/40 via-black/15 to-transparent md:hidden dark:hidden" />
            <div className="absolute inset-0 z-10 flex items-end md:items-center">
              <div className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16">
                <div className="max-w-xl space-y-6">
                  <div className="space-y-3">
                    <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-6xl">
                      {m.home.hero.titlePrefix}
                      {sep}
                      <span className="text-primary">{m.home.hero.titleEmphasis}</span>
                      {sep}
                      {m.home.hero.titleSuffix}
                    </h1>
                    <p className="text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl">
                      {m.home.hero.subtitle}
                    </p>
                  </div>

                  <div className="pointer-events-auto flex flex-col gap-3 sm:flex-row sm:items-center">
                    <Button asChild className="h-auto px-6 py-4 text-base">
                      <Link href={withLocale("/mp-config", locale)}>
                        <Sparkles className="mr-2 h-5 w-5" />
                        {m.home.hero.ctaCustomise}
                        <ChevronRight className="ml-2 h-5 w-5" />
                      </Link>
                    </Button>
                    <BookAppointmentSheet
                      appointmentUrl={appointmentUrl}
                      triggerVariant="outline"
                      triggerClassName="h-auto px-6 py-4 text-base"
                      triggerLabel={m.home.hero.ctaBookAppointment}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                  {m.home.sizeMatters.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {m.home.sizeMatters.description}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <SizeMattersSlideIn />
                </div>
              </div>

              <div className="relative aspect-[3/4] md:aspect-video overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.landing_size_matters}
                  alt="Customised Mpillow"
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Marquee (full-bleed) */}
        <section className="relative py-12 md:py-16">
          <div className="relative left-1/2 w-screen -translate-x-1/2">
            {/* 30% shorter than original (443px -> ~310px): keep full-bleed marquee but reduce height */}
            <AspectRatio ratio={1150 / 310} className="relative overflow-hidden border bg-card/40 backdrop-blur-sm">
              <InfiniteImageMarquee
                src={img.landing_marquee}
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
                  {m.home.ambassadors.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {m.home.ambassadors.description}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <AmbassadorsSlideIn />
                </div>
              </div>

              <div className="relative aspect-[3/4] md:aspect-video overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.landing_ambassadors}
                  alt="Mpillow ambassadors process"
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
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
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{m.home.pickYourMpillow.title}</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {m.home.pickYourMpillow.subtitle}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {[
                  {
                    title: m.home.pickYourMpillow.products.basic.title,
                    desc: m.home.pickYourMpillow.products.basic.description,
                    imageSrc: img.landing_basic_pillow,
                    rightBadge: m.home.pickYourMpillow.products.basic.badge,
                    fromPriceLabel: basicXsFromPrice,
                    specs: [
                      { label: m.home.pickYourMpillow.specs.customisation, level: 1, hint: "" },
                      { label: m.home.pickYourMpillow.specs.fitControl, level: 2, hint: "" },
                    ],
                  },
                  {
                    title: m.home.pickYourMpillow.products.premium.title,
                    desc: m.home.pickYourMpillow.products.premium.description,
                    imageSrc: img.landing_premium_pillow,
                    rightBadge: m.home.pickYourMpillow.products.premium.badge,
                    fromPriceLabel: premiumXsFromPrice,
                    specs: [
                      { label: m.home.pickYourMpillow.specs.customisation, level: 3, hint: "" },
                      { label: m.home.pickYourMpillow.specs.fitControl, level: 4, hint: "" },
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
                          {m.home.pickYourMpillow.fromPricePrefix} {card.fromPriceLabel}
                        </span>
                      </div>
                    </CardContent>

                    <CardFooter className="p-4 pt-0">
                      {card.title === "Basic" ? (
                        <div className="flex w-full items-center gap-2">
                          <BasicMpillowLearnMoreSheet className="flex-1" />
                          <Button asChild className="flex-1">
                            <Link href={withLocale("/mp-config", locale)}>{m.home.pickYourMpillow.buttonCustomise}</Link>
                          </Button>
                        </div>
                      ) : (
                        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                          <PremiumLearnMoreSheet className="flex-1" />
                          <Button asChild className="flex-1">
                            <Link href={withLocale("/mp-config", locale)}>{m.home.pickYourMpillow.buttonCustomise}</Link>
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
            className="mx-auto w-full max-w-6xl px-4 py-12 md:py-16"
          >
            {/* Match the "Ambassadors" section layout style */}
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">{m.home.neckPains.title}</h2>
                <p className="text-muted-foreground leading-relaxed">
                  {m.home.neckPains.description}
                </p>
              </div>

              {/* Desktop: avoid empty right column (keeps alignment clean) */}
              <div className="hidden md:block">
                <div className="rounded-2xl border bg-card/40 p-6 shadow-sm backdrop-blur-sm">
                  <div className="text-sm font-semibold tracking-tight">{m.home.neckPains.feelTitle}</div>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-start gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                      <p>
                        <span className="font-medium text-foreground">{m.home.neckPains.feelSupported.label}</span>{" "}
                        {m.home.neckPains.feelSupported.description}
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <SlidersHorizontal className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                      <p>
                        <span className="font-medium text-foreground">{m.home.neckPains.feelFit.label}</span>{" "}
                        {m.home.neckPains.feelFit.description}
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" aria-hidden="true" />
                      <p>
                        <span className="font-medium text-foreground">{m.home.neckPains.feelUpkeep.label}</span>{" "}
                        {m.home.neckPains.feelUpkeep.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <CervicalNeckSupportLearnMoreCta className="w-full" />
                  </div>
                </div>
              </div>
            </div>

            {/* Image: keep in-flow below text/card (no overlap) */}
            <div className="relative mt-8 overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm md:mt-10 aspect-[3/4] md:aspect-[1048/444]">
              <Image
                src={img.landing_cervical_neck}
                alt="Mpillow cervical neck support"
                fill
                className="object-cover"
                sizes="(min-width: 1280px) 1120px, (min-width: 768px) calc(100vw - 2rem), 100vw"
              />
            </div>
          </div>
        </section>

        {/* Why choose (highlights) */}
        <section className="relative pt-10 md:pt-12">
          <div className="mx-auto w-full max-w-6xl px-4 pb-12 md:pb-16">
            <MagicBento
              className="card-grid--asymmetric rounded-2xl bg-card/40 p-2 shadow-sm backdrop-blur-sm"
              cards={m.home.whyChoose.cards.map((c) => ({ ...c, color: "var(--card)" }))}
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
                <div className="relative aspect-[3/4] w-full md:aspect-[1493/554] lg:aspect-auto lg:min-h-[360px]">
                  <Image
                    src={img.landing_mbolster}
                    alt="Mbolster"
                    fill
                    className="object-cover"
                    sizes="(min-width: 1280px) 560px, (min-width: 768px) 50vw, 100vw"
                  />
                </div>

                <div className="flex flex-col">
                  <CardContent className="p-5 md:p-7">
                    <div className="space-y-2">
                      <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{m.home.mbolster.title}</h2>
                      <p className="text-muted-foreground leading-relaxed">
                        {m.home.mbolster.description}
                      </p>
                    </div>

                    <div className="mt-4">
                      <h3 className="font-semibold">{m.home.mbolster.subtitle}</h3>

                      <div className="mt-4 space-y-2">
                        {[
                          { label: m.home.mbolster.specs.customisation, level: 3 },
                          { label: m.home.mbolster.specs.fitControl, level: 4 },
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
                        <span className="text-2xl font-bold tabular-nums">
                          {m.home.mbolster.fromPricePrefix} {bolsterFromPrice}
                        </span>
                      </div>
                    </div>
                  </CardContent>

                  <CardFooter className="p-5 pt-0 md:p-7 md:pt-0">
                    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
                      <MbolsterLearnMoreSlideIn className="flex-1" />
                      <Button asChild className="flex-1">
                        <Link href={withLocale("/mbolster-config", locale)}>{m.home.mbolster.buttonCustomise}</Link>
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
                <div className="mt-3 text-2xl font-semibold">{m.home.credibility.cards[0]?.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{m.home.credibility.cards[0]?.description}</div>
              </SpotlightCard>
              <SpotlightCard className="min-h-[207px] rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <div className="mt-3 text-2xl font-semibold">{m.home.credibility.cards[1]?.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{m.home.credibility.cards[1]?.description}</div>
              </SpotlightCard>
              <SpotlightCard className="min-h-[207px] rounded-2xl border bg-card/40 p-6 backdrop-blur-sm">
                <BadgeCheck className="h-6 w-6 text-primary" />
                <div className="mt-3 text-2xl font-semibold">{m.home.credibility.cards[2]?.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{m.home.credibility.cards[2]?.description}</div>
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
                  {m.home.review.title}
                </h2>
                <p className="text-muted-foreground">{m.home.review.subtitle}</p>
              </div>

              <AspectRatio
                ratio={16 / 9}
                className="overflow-hidden rounded-2xl border bg-card/40 backdrop-blur-sm"
              >
                <YouTubeAutoplayOnView
                  videoId="nvFI6woJD9g"
                  title={m.home.review.videoTitle}
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
                    <h2 className="mb-3 text-3xl font-bold tracking-tight">{m.home.founder.title}</h2>
                    <p className="text-muted-foreground">{m.home.founder.subtitle}</p>
                  </div>

                  <div className="space-y-6">
                    {m.home.founder.paragraphs.map((text, idx) => (
                      <p key={idx} className="text-muted-foreground leading-relaxed">
                        {text}
                      </p>
                    ))}

                    <div className="pt-2">
                      <p className="font-semibold">{m.home.founder.name}</p>
                      <p className="text-sm text-muted-foreground">{m.home.founder.role}</p>
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border bg-muted">
                    <Image
                      src={img.landing_founder}
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
