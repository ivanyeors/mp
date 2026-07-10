import { HomeHeader } from "@/components/ui/home-header";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getSiteSettings } from "@/lib/site-settings";
import { getLandingSections } from "@/lib/landing-sections";
import { LandingSection } from "@/components/sections/landing/landing-section";
import { SiteJsonLd } from "@/components/seo/site-json-ld";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { getReviewAggregates, type LandingRatings } from "@/lib/seo/review-aggregate";
import { getProductBySlug } from "@/lib/ecommerce/products";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const m = getMessages(locale);

  return buildPageMetadata({
    title: "Mpillow | Custom Pillow Singapore",
    description: m.home.hero.seoAnswer,
    path: "",
    lang: locale,
    keywords: [
      "custom pillow Singapore",
      "customised pillow Singapore",
      "neck pain pillow Singapore",
      "cervical pillow Singapore",
    ],
  });
}

async function getLandingRatings(): Promise<LandingRatings> {
  const empty = { average: 0, count: 0 };
  try {
    const [basic, premium, bolster] = await Promise.all([
      getProductBySlug("mpillow-basic"),
      getProductBySlug("mpillow-premium"),
      getProductBySlug("mbolster"),
    ]);
    const ids = [basic?.id, premium?.id, bolster?.id].filter(Boolean) as string[];
    const aggregates = await getReviewAggregates(ids);
    return {
      basic: basic ? aggregates[basic.id] ?? empty : empty,
      premium: premium ? aggregates[premium.id] ?? empty : empty,
      bolster: bolster ? aggregates[bolster.id] ?? empty : empty,
    };
  } catch {
    return { basic: empty, premium: empty, bolster: empty };
  }
}

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

// Default images – overridable via Settings → Landing Site → Media
const IMAGE_DEFAULTS: Record<string, string> = {
  landing_hero: "/m-pillow-417953-web.webp",
  landing_size_matters: "/images/landing/size-matters.jpg",
  landing_marquee: "/3way-side-sleep.jpg",
  landing_ambassadors: "/images/landing/ambassadors-hero.webp",
  landing_cervical_neck: "/mpillow-cervical-neck.webp",
  landing_basic_pillow: "/basic-mpillow.webp",
  landing_premium_pillow: "/DarkMpillowImage-WEB.jpg",
  landing_mbolster: "/808907f4-ac2b-499a-ace6-69933883b2f5.webp",
  landing_founder: "/Darrenyeo-profileshoot_2.webp",
};

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const m = getMessages(locale);

  const [basicXsFromPrice, premiumXsFromPrice, bolsterFromPrice, siteOverrides, sections, landingRatings] =
    await Promise.all([
    getPillowXsFromPriceLabel("basic"),
    getPillowXsFromPriceLabel("premium"),
    getBolsterFromPriceLabel(),
    getSiteSettings(Object.keys(IMAGE_DEFAULTS)),
    getLandingSections(),
    getLandingRatings(),
  ]);

  // Merge image overrides with defaults
  const img: Record<string, string> = { ...IMAGE_DEFAULTS, ...siteOverrides };

  const prices = { basicXsFromPrice, premiumXsFromPrice, bolsterFromPrice };

  return (
    <div className="min-h-screen bg-background relative">
      <SiteJsonLd lang={locale} />
      <HomeHeader />

      <main className="relative overflow-x-hidden">
        {sections.map((section) => (
          <LandingSection
            key={section.id}
            section={section}
            messages={m}
            locale={locale}
            images={img}
            prices={prices}
            landingRatings={landingRatings}
          />
        ))}
      </main>
    </div>
  );
}
