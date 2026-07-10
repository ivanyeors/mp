import { PageFaqSection } from "@/components/page-faq/page-faq-section";
import { ConfiguratorSeoIntro } from "@/components/seo/configurator-seo-intro";
import { getConfiguratorOfferRange } from "@/lib/seo/configurator-offer-range";
import { buildConfiguratorProductJsonLd } from "@/lib/seo/jsonld-product";
import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { MpConfigClient } from "./mp-config-client";

const INTRO: Record<Locale, { h1: string; lede: string }> = {
  "en-US": {
    h1: "Customise Your Mpillow Cervical Pillow",
    lede:
      "Customise your Mpillow cervical pillow for Singapore sleepers who need a true custom fit — part of our Science of Sleep approach with in-store fitting for neck pain relief. Pick Basic or Premium, choose size and cover, then book an in-store fitting so height, width, and support match your neck and sleep position. Our modular design targets cervical alignment and long-term comfort — not a one-size foam block you cannot adjust after purchase.",
  },
  "zh-CN": {
    h1: "定制您的 Mpillow 枕头",
    lede:
      "为需要真正贴合的新加坡睡眠者定制 Mpillow 颈椎枕。选择基础款或高级款，挑选尺寸与面料，再预约到店试配，使高度、宽度与承托匹配您的颈部与睡姿。模块化设计面向缓解颈椎不适、人体工学对齐与长期舒适，而非无法调节的一刀切泡沫枕。",
  },
};

type Props = {
  params: Promise<{ lang: string }>;
};

export default async function MpConfigPage({ params }: Props) {
  const { lang } = await params;
  const locale: Locale = isSupportedLocale(lang) ? lang : DEFAULT_LOCALE;
  const intro = INTRO[locale];
  const offer = await getConfiguratorOfferRange("pillow");

  const jsonLd = buildConfiguratorProductJsonLd({
    lang: locale,
    path: "/mp-config",
    name: "Mpillow Custom Pillow",
    description: intro.lede,
    image: `${getSiteOrigin()}/basic-mpillow.webp`,
    ...(offer ?? {}),
  });

  return (
    <>
      <ConfiguratorSeoIntro h1={intro.h1} answerLede={intro.lede} jsonLd={jsonLd} />
      <PageFaqSection surfaceKey="mp-config" locale={locale} />
      <MpConfigClient />
    </>
  );
}
