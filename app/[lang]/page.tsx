import { loadLandingPageData } from "@/lib/landing-page-data";
import { getLandingSections } from "@/lib/landing-sections";
import { LandingSectionsList } from "@/components/sections/landing/landing-sections-list";
import { LoadingUntilReady } from "@/components/mpillow-loading";
import { SiteJsonLd } from "@/components/seo/site-json-ld";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { PAGE_META } from "@/lib/seo/page-meta";
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

  return buildPageMetadata({
    ...PAGE_META.home[locale],
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

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;

  return (
    <div className="relative min-h-screen min-w-0 max-w-full bg-background">
      <SiteJsonLd lang={locale} />

      <main className="relative min-w-0 max-w-full overflow-x-hidden">
        <LoadingUntilReady label={getMessages(locale).common.loading}>
          <HomeSections locale={locale} />
        </LoadingUntilReady>
      </main>
    </div>
  );
}

async function HomeSections({ locale }: { locale: Locale }) {
  const [{ images, prices, landingRatings }, sections] = await Promise.all([
    loadLandingPageData(),
    getLandingSections(),
  ]);

  return (
    <LandingSectionsList
      sections={sections}
      messages={getMessages(locale)}
      locale={locale}
      images={images}
      prices={prices}
      landingRatings={landingRatings}
    />
  );
}
