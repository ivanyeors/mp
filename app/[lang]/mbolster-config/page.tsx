import { PageFaqSection } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getPageFaq } from "@/lib/page-faq";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { MbolsterConfigClient } from "./mbolster-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise Your Mbolster",
    lede:
      "Customise your Mbolster — Mpillow's custom-length support bolster for side sleepers in Singapore. Choose short, medium, or long by height — including kids — so the whole household can share the same Science of Sleep approach. Pick a washable case fabric and order online with delivery. Mbolster is built for hip–spine alignment and hug-sleep comfort, using the same ergonomic philosophy as our cervical pillows so your whole sleep setup stays consistent.",
  },
  "zh-CN": {
    h1: "定制您的 Mbolster",
    lede:
      "定制您的 Mbolster——Mpillow 为新加坡侧睡者设计的定制长度支撑抱枕。按身长选择短、中或长尺寸，挑选可洗面料后在线下单。Mbolster 面向髋部与脊柱对齐及环抱睡姿舒适，理念与我们的颈椎枕一致，让整套睡眠配置保持统一。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function MbolsterConfigPage({ params }: Props) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];
  const [offer, faq] = await Promise.all([
    getConfiguratorOfferRange("bolster"),
    getPageFaq("mbolster-config", locale),
  ]);

  const jsonLd = buildConfiguratorProductJsonLd({
    lang: locale,
    path: "/mbolster-config",
    name: "Mbolster Custom Support Bolster",
    description: intro.lede,
    image: `${getSiteOrigin()}/bolster_mbolster_size.webp`,
    ...(offer ?? {}),
  });

  return (
    <>
      {/* Crawlable SEO shell; UI lives in the welcome (i) dialog */}
      <div className="sr-only">
        <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
        <PageFaqSection surfaceKey="mbolster-config" locale={locale} />
      </div>
      <MbolsterConfigClient
        info={{
          h1: intro.h1,
          lede: intro.lede,
          faqTitle: faq?.title ?? null,
          faqItems: faq?.items ?? [],
        }}
      />
    </>
  );
}
